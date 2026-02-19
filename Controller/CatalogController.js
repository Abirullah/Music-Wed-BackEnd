import mongoose from "mongoose";
import SongsModel from "../Models/SongsModel.js";
import ContantModel from "../Models/ContantModel.js";
import PiracyComplaintModel from "../Models/PiracyComplaintModel.js";
import PurchaseModel from "../Models/PurchaseModel.js";
import UserModel from "../Models/UserModel.js";
import { normalizeSong, normalizeContent, getModelByItemType } from "../Utils/catalogMapper.js";

const parseInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ""));

const parseList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const buildSongQuery = ({ search, genre, mood, language, artist }) => {
  const query = {};
  const genres = parseList(genre);
  const moods = parseList(mood);
  const languages = parseList(language);
  const artists = parseList(artist);

  if (genres.length) query.genre = { $in: genres };
  if (moods.length) query.mood = { $in: moods };
  if (languages.length) query.language = { $in: languages };
  if (artists.length) query.artistName = { $in: artists };

  if (search) {
    const regex = new RegExp(search, "i");
    query.$or = [
      { musicName: regex },
      { artistName: regex },
      { genre: regex },
      { mood: regex },
      { language: regex },
    ];
  }

  return query;
};

const buildContentQuery = ({ search, genre, mood, language, artist }) => {
  const query = {};
  const genres = parseList(genre);
  const moods = parseList(mood);
  const languages = parseList(language);
  const artists = parseList(artist);

  if (genres.length) query.genre = { $in: genres };
  if (moods.length) query.mood = { $in: moods };
  if (languages.length) query.language = { $in: languages };
  if (artists.length) query.artistName = { $in: artists };

  if (search) {
    const regex = new RegExp(search, "i");
    query.$or = [
      { contentName: regex },
      { artistName: regex },
      { genre: regex },
      { mood: regex },
      { language: regex },
    ];
  }

  return query;
};

const sortItems = (items, sortBy) => {
  const rows = [...items];

  switch (sortBy) {
    case "price_asc":
      rows.sort((a, b) => (a.price || 0) - (b.price || 0));
      return rows;
    case "price_desc":
      rows.sort((a, b) => (b.price || 0) - (a.price || 0));
      return rows;
    case "name_asc":
      rows.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
      return rows;
    case "oldest":
      rows.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      return rows;
    case "latest":
    default:
      rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      return rows;
  }
};

const uniqueSorted = (items) => Array.from(new Set(items.filter(Boolean))).sort((a, b) => a.localeCompare(b));

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const findItemByUploaderAndName = async ({ uploaderName = "", itemName = "", itemType = "all" }) => {
  const normalizedUploader = String(uploaderName || "").trim();
  const normalizedItemName = String(itemName || "").trim();
  const normalizedItemType = String(itemType || "all").toLowerCase();

  if (!normalizedUploader || !normalizedItemName) return null;

  const uploaderRegex = new RegExp(escapeRegex(normalizedUploader), "i");
  const nameRegex = new RegExp(escapeRegex(normalizedItemName), "i");

  const searchSongs = normalizedItemType === "all" || normalizedItemType === "song";
  const searchContents = normalizedItemType === "all" || normalizedItemType === "content";

  if (searchSongs) {
    const songCandidates = await SongsModel.find({ musicName: nameRegex })
      .sort({ createdAt: -1 })
      .populate("owner", "name email")
      .lean();

    const song = songCandidates.find((candidate) => uploaderRegex.test(String(candidate.owner?.name || "")));
    if (song) {
      return {
        itemType: "song",
        itemModel: "Song",
        itemId: song._id,
        itemName: song.musicName,
        ownerId: song.owner?._id || song.owner,
        ownerName: String(song.owner?.name || ""),
      };
    }
  }

  if (searchContents) {
    const contentCandidates = await ContantModel.find({ contentName: nameRegex })
      .sort({ createdAt: -1 })
      .populate("owner", "name email")
      .lean();

    const content = contentCandidates.find((candidate) =>
      uploaderRegex.test(String(candidate.owner?.name || "")),
    );
    if (content) {
      return {
        itemType: "content",
        itemModel: "Contant",
        itemId: content._id,
        itemName: content.contentName,
        ownerId: content.owner?._id || content.owner,
        ownerName: String(content.owner?.name || ""),
      };
    }
  }

  return null;
};

const buildYearWindow = (yearValue) => {
  const currentYear = new Date().getFullYear();
  const parsedYear = Number.parseInt(String(yearValue || currentYear), 10);
  const safeYear = Number.isFinite(parsedYear) ? parsedYear : currentYear;
  const start = new Date(Date.UTC(safeYear, 0, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(safeYear + 1, 0, 1, 0, 0, 0, 0));

  return { safeYear, start, end };
};

export const getCatalogItems = async (req, res) => {
  try {
    const type = String(req.query.type || "all").toLowerCase();
    const search = String(req.query.search || req.query.q || "").trim();
    const genre = String(req.query.genre || "").trim();
    const mood = String(req.query.mood || "").trim();
    const language = String(req.query.language || "").trim();
    const artist = String(req.query.artist || "").trim();
    const sort = String(req.query.sort || "latest").toLowerCase();

    const page = parseInteger(req.query.page, 1);
    const limit = parseInteger(req.query.limit, 24);

    const songQuery = buildSongQuery({ search, genre, mood, language, artist });
    const contentQuery = buildContentQuery({ search, genre, mood, language, artist });

    const [songs, contents] = await Promise.all([
      type === "content" ? [] : SongsModel.find(songQuery).lean(),
      type === "song" || type === "music" ? [] : ContantModel.find(contentQuery).lean(),
    ]);

    const normalizedSongs = songs.map((song) => normalizeSong(song));
    const normalizedContents = contents.map((content) => normalizeContent(content));

    const allItems = sortItems([...normalizedSongs, ...normalizedContents], sort);

    const total = allItems.length;
    const start = (page - 1) * limit;
    const paginated = allItems.slice(start, start + limit);

    const filterOptions = {
      genre: uniqueSorted(allItems.map((item) => item.genre)),
      mood: uniqueSorted(allItems.map((item) => item.mood)),
      artist: uniqueSorted(allItems.map((item) => item.artist)),
      language: uniqueSorted(allItems.map((item) => item.language)),
    };

    return res.status(200).json({
      items: paginated,
      filters: filterOptions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error("Error fetching catalog:", error);
    return res.status(500).json({ message: "Failed to fetch catalog" });
  }
};

export const getCatalogItemById = async (req, res) => {
  try {
    const itemType = String(req.params.itemType || "").toLowerCase();
    const itemId = String(req.params.itemId || "");

    if (!["song", "content"].includes(itemType)) {
      return res.status(400).json({ message: "Invalid item type" });
    }

    if (!isObjectId(itemId)) {
      return res.status(400).json({ message: "Invalid item id" });
    }

    const modelInfo = getModelByItemType(itemType);
    const item = await modelInfo.model.findById(itemId).lean();

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    const normalized = itemType === "song" ? normalizeSong(item) : normalizeContent(item);

    return res.status(200).json({ item: normalized });
  } catch (error) {
    console.error("Error fetching catalog item:", error);
    return res.status(500).json({ message: "Failed to fetch item" });
  }
};

export const getArtistsCollection = async (_req, res) => {
  try {
    const [songsAgg, contentAgg] = await Promise.all([
      SongsModel.aggregate([
        { $group: { _id: "$artistName", songUploads: { $sum: 1 } } },
      ]),
      ContantModel.aggregate([
        { $group: { _id: "$artistName", contentUploads: { $sum: 1 } } },
      ]),
    ]);

    const map = new Map();

    for (const row of songsAgg) {
      const name = String(row._id || "").trim();
      if (!name) continue;
      map.set(name, {
        name,
        songUploads: row.songUploads || 0,
        contentUploads: 0,
      });
    }

    for (const row of contentAgg) {
      const name = String(row._id || "").trim();
      if (!name) continue;

      const existing = map.get(name);
      if (existing) {
        existing.contentUploads = row.contentUploads || 0;
      } else {
        map.set(name, {
          name,
          songUploads: 0,
          contentUploads: row.contentUploads || 0,
        });
      }
    }

    const artists = Array.from(map.values())
      .map((artist) => ({
        ...artist,
        totalUploads: artist.songUploads + artist.contentUploads,
      }))
      .sort((a, b) => b.totalUploads - a.totalUploads || a.name.localeCompare(b.name));

    return res.status(200).json({ artists });
  } catch (error) {
    console.error("Error fetching artists collection:", error);
    return res.status(500).json({ message: "Failed to fetch artists" });
  }
};

export const reportPiracyByItem = async (req, res) => {
  try {
    const itemType = String(req.params.itemType || "").toLowerCase();
    const itemId = String(req.params.itemId || "");

    if (!["song", "content"].includes(itemType)) {
      return res.status(400).json({ message: "Invalid item type" });
    }

    if (!isObjectId(itemId)) {
      return res.status(400).json({ message: "Invalid item id" });
    }

    const model = itemType === "song" ? SongsModel : ContantModel;
    const itemModel = itemType === "song" ? "Song" : "Contant";
    const item = await model.findById(itemId).lean();

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    const reporter = await UserModel.findById(req.user?.id || null)
      .select("name email")
      .lean();
    const ownerUser = await UserModel.findById(item.owner).select("name").lean();
    const ownerName = String(ownerUser?.name || req.body.ownerName || "").trim();

    const complaint = await PiracyComplaintModel.create({
      reportedBy: req.user?.id || null,
      reporterName: String(reporter?.name || ""),
      reporterEmail: String(reporter?.email || req.user?.email || ""),
      owner: item.owner,
      ownerName,
      uploaderName: String(req.body.uploaderName || ownerName || "").trim(),
      itemType,
      itemModel,
      item: item._id,
      itemName: itemType === "song" ? item.musicName : item.contentName,
      pincode: String(req.body.pincode || "").trim(),
      violationTimeframe: String(req.body.violationTimeframe || "").trim(),
      details: String(req.body.details || "").trim(),
    });

    return res.status(201).json({
      message: "Piracy complaint submitted",
      complaintId: String(complaint._id),
      ownerId: String(complaint.owner),
    });
  } catch (error) {
    console.error("Error reporting piracy complaint:", error);
    return res.status(500).json({ message: "Failed to submit piracy complaint" });
  }
};

export const reportPiracyByName = async (req, res) => {
  try {
    const requesterRole = String(req.user?.role || "").toLowerCase();
    if (["owner", "admin"].includes(requesterRole)) {
      return res.status(403).json({ message: "Only user accounts can submit this complaint form" });
    }

    const uploaderName = String(req.body.uploaderName || "").trim();
    const itemName = String(req.body.itemName || req.body.songName || "").trim();
    const itemType = String(req.body.itemType || "all").toLowerCase();
    const pincode = String(req.body.pincode || "").trim();
    const violationTimeframe = String(req.body.violationTimeframe || "").trim();
    const details = String(req.body.details || "").trim();

    if (!uploaderName || !itemName) {
      return res.status(400).json({ message: "Uploader name and song/content name are required" });
    }

    if (!["all", "song", "content"].includes(itemType)) {
      return res.status(400).json({ message: "Invalid item type" });
    }

    const matchedItem = await findItemByUploaderAndName({
      uploaderName,
      itemName,
      itemType,
    });

    if (!matchedItem) {
      return res.status(404).json({
        message:
          "No matching upload found for the provided uploader name and song/content name",
      });
    }

    const reporter = await UserModel.findById(req.user?.id || null)
      .select("name email")
      .lean();

    const complaint = await PiracyComplaintModel.create({
      reportedBy: req.user?.id || null,
      reporterName: String(reporter?.name || ""),
      reporterEmail: String(reporter?.email || req.user?.email || ""),
      owner: matchedItem.ownerId,
      ownerName: matchedItem.ownerName,
      uploaderName,
      itemType: matchedItem.itemType,
      itemModel: matchedItem.itemModel,
      item: matchedItem.itemId,
      itemName: matchedItem.itemName,
      pincode,
      violationTimeframe,
      details,
    });

    return res.status(201).json({
      message: "Piracy complaint submitted successfully",
      complaintId: String(complaint._id),
      ownerId: String(complaint.owner),
    });
  } catch (error) {
    console.error("Error reporting piracy complaint by name:", error);
    return res.status(500).json({ message: "Failed to submit piracy complaint" });
  }
};

export const getTopOwnerInsights = async (req, res) => {
  try {
    const topOwnerRow = await PurchaseModel.aggregate([
      { $match: { status: "paid" } },
      {
        $group: {
          _id: "$owner",
          totalRevenue: { $sum: "$amount" },
          totalSales: { $sum: 1 },
        },
      },
      { $sort: { totalRevenue: -1, totalSales: -1 } },
      { $limit: 1 },
    ]);

    if (!topOwnerRow.length) {
      return res.status(200).json({
        owner: null,
        year: new Date().getFullYear(),
        labels: MONTH_LABELS,
        series: new Array(12).fill(0),
        totalRevenue: 0,
        totalSales: 0,
      });
    }

    const topOwnerId = topOwnerRow[0]._id;
    const owner = await UserModel.findById(topOwnerId)
      .select("name email profilePicture createdAt")
      .lean();

    const { safeYear, start, end } = buildYearWindow(req.query.year);

    const monthlyRows = await PurchaseModel.aggregate([
      {
        $match: {
          owner: topOwnerId,
          status: "paid",
        },
      },
      {
        $addFields: {
          effectiveDate: { $ifNull: ["$purchasedAt", "$createdAt"] },
        },
      },
      {
        $match: {
          effectiveDate: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: { $month: "$effectiveDate" },
          value: { $sum: "$amount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const monthlyMap = new Map(
      monthlyRows.map((row) => [Number.parseInt(String(row._id), 10), row.value || 0]),
    );
    const series = MONTH_LABELS.map((_, index) => monthlyMap.get(index + 1) || 0);

    return res.status(200).json({
      owner: owner
        ? {
            id: String(owner._id),
            name: owner.name,
            email: owner.email,
            profilePicture: owner.profilePicture || null,
            createdAt: owner.createdAt || null,
          }
        : null,
      year: safeYear,
      labels: MONTH_LABELS,
      series,
      totalRevenue: topOwnerRow[0].totalRevenue || 0,
      totalSales: topOwnerRow[0].totalSales || 0,
    });
  } catch (error) {
    console.error("Error fetching top owner insights:", error);
    return res.status(500).json({ message: "Failed to fetch top owner insights" });
  }
};
