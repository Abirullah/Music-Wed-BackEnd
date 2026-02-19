import mongoose from "mongoose";
import PurchaseModel from "../Models/PurchaseModel.js";
import SongsModel from "../Models/SongsModel.js";
import ContantModel from "../Models/ContantModel.js";

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ""));

let stripeClient = null;
let stripeInitAttempted = false;

const getStripeClient = async () => {
  if (stripeInitAttempted) return stripeClient;
  stripeInitAttempted = true;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    stripeClient = null;
    return stripeClient;
  }

  try {
    const stripeModule = await import("stripe");
    const Stripe = stripeModule.default;
    stripeClient = new Stripe(secretKey);
    return stripeClient;
  } catch (error) {
    console.error("Stripe SDK unavailable:", error.message);
    stripeClient = null;
    return stripeClient;
  }
};

const createLicenseCode = () => {
  const now = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ECH-${now}-${random}`;
};

const getItemForPurchase = async ({ itemType, itemId }) => {
  if (!isObjectId(itemId)) return null;

  if (itemType === "song") {
    const song = await SongsModel.findById(itemId).lean();
    if (!song) return null;

    return {
      itemModel: "Song",
      ownerId: String(song.owner),
      itemName: song.musicName,
      artistName: song.artistName,
      amount: song.price || 0,
      item: song,
    };
  }

  if (itemType === "content") {
    const content = await ContantModel.findById(itemId).lean();
    if (!content) return null;

    return {
      itemModel: "Contant",
      ownerId: String(content.owner),
      itemName: content.contentName,
      artistName: content.artistName,
      amount: content.price || 0,
      item: content,
    };
  }

  return null;
};

export const createCheckoutSession = async (req, res) => {
  try {
    const requesterId = String(req.user?.id || "");
    const requesterRole = String(req.user?.role || "").toLowerCase();

    const userId = String(req.body.userId || requesterId);
    const itemType = String(req.body.itemType || "").toLowerCase();
    const itemId = String(req.body.itemId || "");
    const successUrl = String(req.body.successUrl || "").trim();
    const cancelUrl = String(req.body.cancelUrl || "").trim();

    if (!isObjectId(userId) || !isObjectId(itemId)) {
      return res.status(400).json({ message: "Invalid ids provided" });
    }

    if (!["song", "content"].includes(itemType)) {
      return res.status(400).json({ message: "Invalid item type" });
    }

    if (requesterId !== userId && requesterRole !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const itemData = await getItemForPurchase({ itemType, itemId });
    if (!itemData) {
      return res.status(404).json({ message: "Item not found" });
    }

    if (itemData.ownerId === requesterId && requesterRole !== "admin") {
      return res.status(400).json({ message: "Owner cannot purchase own item" });
    }

    const existingPaid = await PurchaseModel.findOne({
      user: userId,
      itemType,
      item: itemId,
      status: "paid",
    }).lean();

    if (existingPaid) {
      return res.status(200).json({
        message: "Item already purchased",
        alreadyPurchased: true,
        purchase: {
          id: String(existingPaid._id),
          status: existingPaid.status,
          amount: existingPaid.amount,
          licenseCode: existingPaid.licenseCode,
        },
      });
    }

    const amount = Math.max(Number(itemData.amount || 0), 0);

    const pendingPurchase = await PurchaseModel.findOneAndUpdate(
      {
        user: userId,
        itemType,
        item: itemId,
        status: "pending",
      },
      {
        user: userId,
        owner: itemData.ownerId,
        itemType,
        itemModel: itemData.itemModel,
        item: itemId,
        itemName: itemData.itemName,
        artistName: itemData.artistName,
        amount,
        currency: "usd",
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    if (amount <= 0) {
      pendingPurchase.status = "paid";
      pendingPurchase.purchasedAt = new Date();
      pendingPurchase.licenseCode = pendingPurchase.licenseCode || createLicenseCode();
      await pendingPurchase.save();

      return res.status(201).json({
        message: "Free item unlocked successfully",
        purchaseId: String(pendingPurchase._id),
        checkoutUrl: "",
        sessionId: "",
        mock: true,
      });
    }

    const stripe = await getStripeClient();

    if (stripe && successUrl && cancelUrl) {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        success_url: `${successUrl}${successUrl.includes("?") ? "&" : "?"}purchaseId=${pendingPurchase._id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: Math.round(amount * 100),
              product_data: {
                name: itemData.itemName,
                description: `${itemType.toUpperCase()} by ${itemData.artistName}`,
              },
            },
          },
        ],
        metadata: {
          purchaseId: String(pendingPurchase._id),
          userId,
          itemType,
          itemId,
        },
      });

      pendingPurchase.stripeSessionId = session.id;
      await pendingPurchase.save();

      return res.status(201).json({
        message: "Checkout session created",
        purchaseId: String(pendingPurchase._id),
        checkoutUrl: session.url,
        sessionId: session.id,
        mock: false,
      });
    }

    return res.status(201).json({
      message:
        "Stripe is not fully configured. Mock checkout created; call confirm endpoint to mark this purchase as paid.",
      purchaseId: String(pendingPurchase._id),
      checkoutUrl: successUrl || "",
      sessionId: "",
      mock: true,
    });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return res.status(500).json({ message: "Failed to create checkout session" });
  }
};

export const confirmCheckout = async (req, res) => {
  try {
    const requesterId = String(req.user?.id || "");
    const requesterRole = String(req.user?.role || "").toLowerCase();

    const purchaseId = String(req.body.purchaseId || "");
    const sessionId = String(req.body.sessionId || "").trim();
    const forceMockSuccess = Boolean(req.body.mockSuccess);

    if (!isObjectId(purchaseId)) {
      return res.status(400).json({ message: "Invalid purchase id" });
    }

    const purchase = await PurchaseModel.findById(purchaseId);
    if (!purchase) {
      return res.status(404).json({ message: "Purchase not found" });
    }

    if (String(purchase.user) !== requesterId && requesterRole !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (purchase.status === "paid") {
      return res.status(200).json({
        message: "Purchase already confirmed",
        purchase: {
          id: String(purchase._id),
          status: purchase.status,
          licenseCode: purchase.licenseCode,
        },
      });
    }

    let markAsPaid = false;
    let paymentIntentId = "";

    if (sessionId) {
      const stripe = await getStripeClient();
      if (stripe) {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status === "paid") {
          markAsPaid = true;
          paymentIntentId = String(session.payment_intent || "");
        }
      }
    }

    if (!markAsPaid && forceMockSuccess) {
      markAsPaid = true;
    }

    if (!markAsPaid) {
      return res.status(400).json({ message: "Payment is not completed yet" });
    }

    purchase.status = "paid";
    purchase.purchasedAt = new Date();
    purchase.licenseCode = purchase.licenseCode || createLicenseCode();
    if (sessionId) {
      purchase.stripeSessionId = sessionId;
    }
    if (paymentIntentId) {
      purchase.stripePaymentIntentId = paymentIntentId;
    }

    await purchase.save();

    return res.status(200).json({
      message: "Purchase confirmed",
      purchase: {
        id: String(purchase._id),
        status: purchase.status,
        amount: purchase.amount,
        licenseCode: purchase.licenseCode,
        itemType: purchase.itemType,
        itemId: String(purchase.item),
      },
    });
  } catch (error) {
    console.error("Error confirming checkout:", error);
    return res.status(500).json({ message: "Failed to confirm checkout" });
  }
};

export const getPurchaseStatus = async (req, res) => {
  try {
    const purchaseId = String(req.params.purchaseId || "");
    const requesterId = String(req.user?.id || "");
    const requesterRole = String(req.user?.role || "").toLowerCase();

    if (!isObjectId(purchaseId)) {
      return res.status(400).json({ message: "Invalid purchase id" });
    }

    const purchase = await PurchaseModel.findById(purchaseId).lean();
    if (!purchase) {
      return res.status(404).json({ message: "Purchase not found" });
    }

    if (String(purchase.user) !== requesterId && requesterRole !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    return res.status(200).json({
      purchase: {
        id: String(purchase._id),
        status: purchase.status,
        amount: purchase.amount,
        currency: purchase.currency,
        licenseCode: purchase.licenseCode,
        itemType: purchase.itemType,
        itemId: String(purchase.item),
        purchasedAt: purchase.purchasedAt,
      },
    });
  } catch (error) {
    console.error("Error getting purchase status:", error);
    return res.status(500).json({ message: "Failed to fetch purchase status" });
  }
};
