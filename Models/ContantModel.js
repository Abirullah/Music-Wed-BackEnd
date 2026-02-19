import mongoose from "mongoose";

const contentSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    itemType: {
      type: String,
      default: "content",
      immutable: true,
    },
    copyrightOwner: {
      type: String,
      required: true,
      trim: true,
    },
    coverTemplate: {
      type: String,
      required: true,
      trim: true,
    },
    contentFileUrl: {
      type: String,
      default: "",
      trim: true,
    },
    contentName: {
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
    expiryType: {
      type: String,
      default: "",
      trim: true,
    },
    experience: {
      type: String,
      default: "",
      trim: true,
    },
    links: {
      instagram: { type: String, default: "" },
      youtube: { type: String, default: "" },
      twitter: { type: String, default: "" },
      facebook: { type: String, default: "" },
      linkedin: { type: String, default: "" },
      people: { type: String, default: "" },
      snapchat: { type: String, default: "" },
      other: { type: String, default: "" },
    },
    permission: {
      uploadPermission: {
        type: String,
        enum: ["commercial", "custom", ""],
        default: "",
      },
      uploadPlatform: { type: String, default: "" },
      subscriberRange: { type: String, default: "" },
      customLicense: { type: String, default: "" },
      uploadHeading: { type: String, default: "" },
      uploadExpiryValue: { type: String, default: "" },
      uploadNonExpiryValue: { type: String, default: "" },
    },
    repostPermission: {
      type: String,
      enum: ["yes", "no", ""],
      default: "",
    },
    annexture: {
      type: String,
      required: true,
      trim: true,
    },
    agreement: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

contentSchema.index({ contentName: "text", artistName: "text", genre: "text", mood: "text", language: "text" });

const ContantModel = mongoose.model("Contant", contentSchema);

export default ContantModel;
