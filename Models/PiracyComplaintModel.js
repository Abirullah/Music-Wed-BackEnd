import mongoose from "mongoose";

const piracyComplaintSchema = new mongoose.Schema(
  {
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    reporterName: {
      type: String,
      default: "",
      trim: true,
    },
    reporterEmail: {
      type: String,
      default: "",
      trim: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    ownerName: {
      type: String,
      default: "",
      trim: true,
    },
    uploaderName: {
      type: String,
      default: "",
      trim: true,
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
    complaintDate: {
      type: Date,
      default: Date.now,
    },
    pincode: {
      type: String,
      default: "",
      trim: true,
    },
    violationTimeframe: {
      type: String,
      default: "",
      trim: true,
    },
    details: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["open", "resolved"],
      default: "open",
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

const PiracyComplaintModel = mongoose.model("PiracyComplaint", piracyComplaintSchema);

export default PiracyComplaintModel;
