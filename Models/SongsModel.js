import mongoose from "mongoose";

const songSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    itemType: {
      type: String,
      default: "song",
      immutable: true,
    },
    musicCategory: {
      type: String,
      enum: ["Song", "Instrumental"],
      default: "Song",
      index: true,
    },
    copyrightOwner: {
      type: String,
      required: true,
      trim: true,
    },
    musicLink: {
      type: String,
      required: true,
      trim: true,
    },
    cover: {
      type: String,
      required: true,
      trim: true,
    },
    musicName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    artistName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    releaseDate: {
      type: Date,
      required: true,
      index: true,
    },
    language: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    genre: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    mood: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    links: {
      spotify: { type: String, default: "" },
      youtube: { type: String, default: "" },
      gaana: { type: String, default: "" },
      amazon: { type: String, default: "" },
      wynk: { type: String, default: "" },
      apple: { type: String, default: "" },
      other: { type: String, default: "" },
    },
    affiliateLink: {
      type: String,
      default: "",
      trim: true,
    },
    purpose: {
      pricingLicense: {
        type: String,
        enum: ["Public places", "Individual"],
        default: "Individual",
      },
      pricingUse: { type: String, default: "" },
      pricingPlace: { type: String, default: "" },
      seatingCapacity: { type: String, default: "" },
      priceYear: { type: Number, default: 0 },
      priceSixMonths: { type: Number, default: 0 },
    },
    price: {
      type: Number,
      default: 0,
      index: true,
    },
    agreement1: {
      type: String,
      required: true,
      trim: true,
    },
    agreement2: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

songSchema.index({ musicName: "text", artistName: "text", genre: "text", mood: "text", language: "text" });

const SongsModel = mongoose.model("Song", songSchema);

export default SongsModel;
