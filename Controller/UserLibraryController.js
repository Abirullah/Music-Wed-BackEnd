import mongoose from "mongoose";
import FavoriteModel from "../Models/FavoriteModel.js";
import PurchaseModel from "../Models/PurchaseModel.js";
import SongsModel from "../Models/SongsModel.js";
import ContantModel from "../Models/ContantModel.js";
import { getModelByItemType, normalizeSong, normalizeContent } from "../Utils/catalogMapper.js";

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ""));

const ensureUserAccess = ({ req, userId }) => {
  const requesterId = String(req.user?.id || "");
  const requesterRole = String(req.user?.role || "").toLowerCase();
  if (requesterId === userId || requesterRole === "admin") {
    return true;
  }
  return false;
};

const normalizeItem = (itemType, itemDoc) => {
  if (!itemDoc) return null;
  return itemType === "song" ? normalizeSong(itemDoc) : normalizeContent(itemDoc);
};

const resolveItemByType = async ({ itemType, itemId }) => {
  const modelInfo = getModelByItemType(itemType);
  if (!modelInfo) return null;

  const item = await modelInfo.model.findById(itemId);
  if (!item) return null;

  return { modelInfo, item };
};

export const getUserFavorites = async (req, res) => {
  try {
    const userId = String(req.params.userId || "");

    if (!isObjectId(userId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    if (!ensureUserAccess({ req, userId })) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const favorites = await FavoriteModel.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate("item")
      .lean();

    const items = favorites
      .map((favorite) => {
        const normalized = normalizeItem(favorite.itemType, favorite.item);
        if (!normalized) return null;

        return {
          ...normalized,
          favoriteId: String(favorite._id),
          isFavorite: true,
        };
      })
      .filter(Boolean);

    return res.status(200).json({ items });
  } catch (error) {
    console.error("Error fetching favorites:", error);
    return res.status(500).json({ message: "Failed to fetch favorites" });
  }
};

export const addFavorite = async (req, res) => {
  try {
    const userId = String(req.params.userId || "");
    const itemType = String(req.body.itemType || "").toLowerCase();
    const itemId = String(req.body.itemId || "");

    if (!isObjectId(userId) || !isObjectId(itemId)) {
      return res.status(400).json({ message: "Invalid ids provided" });
    }

    if (!ensureUserAccess({ req, userId })) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (!["song", "content"].includes(itemType)) {
      return res.status(400).json({ message: "Invalid item type" });
    }

    const itemResult = await resolveItemByType({ itemType, itemId });
    if (!itemResult) {
      return res.status(404).json({ message: "Item not found" });
    }

    const favorite = await FavoriteModel.findOneAndUpdate(
      { user: userId, itemType, item: itemId },
      {
        user: userId,
        itemType,
        itemModel: itemResult.modelInfo.itemModel,
        item: itemId,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return res.status(201).json({
      message: "Added to favorites",
      favoriteId: String(favorite._id),
    });
  } catch (error) {
    console.error("Error adding favorite:", error);
    return res.status(500).json({ message: "Failed to add favorite" });
  }
};

export const removeFavorite = async (req, res) => {
  try {
    const userId = String(req.params.userId || "");
    const itemType = String(req.params.itemType || "").toLowerCase();
    const itemId = String(req.params.itemId || "");

    if (!isObjectId(userId) || !isObjectId(itemId)) {
      return res.status(400).json({ message: "Invalid ids provided" });
    }

    if (!ensureUserAccess({ req, userId })) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await FavoriteModel.findOneAndDelete({ user: userId, itemType, item: itemId });

    return res.status(200).json({ message: "Removed from favorites" });
  } catch (error) {
    console.error("Error removing favorite:", error);
    return res.status(500).json({ message: "Failed to remove favorite" });
  }
};

export const getUserPurchases = async (req, res) => {
  try {
    const userId = String(req.params.userId || "");

    if (!isObjectId(userId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    if (!ensureUserAccess({ req, userId })) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const purchases = await PurchaseModel.find({ user: userId, status: "paid" })
      .sort({ purchasedAt: -1, createdAt: -1 })
      .populate("item")
      .lean();

    const items = purchases.map((purchase) => {
      const normalized = normalizeItem(purchase.itemType, purchase.item);
      const purchasedAt = purchase.purchasedAt || purchase.updatedAt;

      return {
        purchaseId: String(purchase._id),
        itemType: purchase.itemType,
        itemId: String(purchase.item),
        licenseCode: purchase.licenseCode,
        amount: purchase.amount,
        currency: purchase.currency,
        purchasedAt,
        item: normalized,
      };
    });

    return res.status(200).json({ items });
  } catch (error) {
    console.error("Error fetching purchases:", error);
    return res.status(500).json({ message: "Failed to fetch purchases" });
  }
};

export const getDownloadLink = async (req, res) => {
  try {
    const userId = String(req.params.userId || "");
    const itemType = String(req.params.itemType || "").toLowerCase();
    const itemId = String(req.params.itemId || "");

    if (!isObjectId(userId) || !isObjectId(itemId)) {
      return res.status(400).json({ message: "Invalid ids provided" });
    }

    if (!["song", "content"].includes(itemType)) {
      return res.status(400).json({ message: "Invalid item type" });
    }

    if (!ensureUserAccess({ req, userId })) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const itemResult = await resolveItemByType({ itemType, itemId });
    if (!itemResult) {
      return res.status(404).json({ message: "Item not found" });
    }

    const requesterId = String(req.user?.id || "");
    const requesterRole = String(req.user?.role || "").toLowerCase();
    const isOwner = String(itemResult.item.owner) === requesterId;

    let hasPurchased = false;
    if (!isOwner && requesterRole !== "admin") {
      const purchase = await PurchaseModel.findOne({
        user: userId,
        itemType,
        item: itemId,
        status: "paid",
      }).lean();

      hasPurchased = Boolean(purchase);
    }

    if (!isOwner && requesterRole !== "admin" && !hasPurchased) {
      return res.status(403).json({ message: "Purchase required before download" });
    }

    const downloadUrl =
      itemType === "song"
        ? itemResult.item.musicLink
        : itemResult.item.links?.youtube || itemResult.item.coverTemplate;

    if (!downloadUrl) {
      return res.status(404).json({ message: "Download URL not available" });
    }

    return res.status(200).json({
      message: "Download allowed",
      downloadUrl,
    });
  } catch (error) {
    console.error("Error getting download link:", error);
    return res.status(500).json({ message: "Failed to get download link" });
  }
};

export const getUserLibrarySummary = async (req, res) => {
  try {
    const userId = String(req.params.userId || "");
    if (!isObjectId(userId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    if (!ensureUserAccess({ req, userId })) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const [favoritesCount, purchasesCount] = await Promise.all([
      FavoriteModel.countDocuments({ user: userId }),
      PurchaseModel.countDocuments({ user: userId, status: "paid" }),
    ]);

    return res.status(200).json({
      summary: {
        favoritesCount,
        purchasesCount,
      },
    });
  } catch (error) {
    console.error("Error fetching user library summary:", error);
    return res.status(500).json({ message: "Failed to fetch library summary" });
  }
};

export const hasUserPurchased = async ({ userId, itemType, itemId }) => {
  if (!isObjectId(userId) || !isObjectId(itemId)) return false;

  const purchase = await PurchaseModel.findOne({
    user: userId,
    itemType,
    item: itemId,
    status: "paid",
  }).lean();

  return Boolean(purchase);
};

export const getItemOwner = async ({ itemType, itemId }) => {
  if (!isObjectId(itemId)) return null;

  if (itemType === "song") {
    const item = await SongsModel.findById(itemId).lean();
    return item ? String(item.owner) : null;
  }

  if (itemType === "content") {
    const item = await ContantModel.findById(itemId).lean();
    return item ? String(item.owner) : null;
  }

  return null;
};
