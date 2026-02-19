import mongoose from "mongoose";

const purchaseSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    itemType: {
      type: String,
      enum: ["song", "content"],
      required: true,
      index: true,
    },
    itemModel: {
      type: String,
      enum: ["Song", "Contant"],
      required: true,
    },
    item: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "itemModel",
      index: true,
    },
    itemName: {
      type: String,
      required: true,
      trim: true,
    },
    artistName: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "usd",
      lowercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
      index: true,
    },
    licenseCode: {
      type: String,
      default: "",
      index: true,
    },
    stripeSessionId: {
      type: String,
      default: "",
      index: true,
    },
    stripePaymentIntentId: {
      type: String,
      default: "",
    },
    purchasedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

purchaseSchema.index({ user: 1, itemType: 1, item: 1, status: 1 });

const PurchaseModel = mongoose.model("Purchase", purchaseSchema);

export default PurchaseModel;
