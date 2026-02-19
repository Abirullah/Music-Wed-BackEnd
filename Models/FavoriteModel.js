import mongoose from "mongoose";

const favoriteSchema = new mongoose.Schema(
  {
    user: {
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
  },
  {
    timestamps: true,
  },
);

favoriteSchema.index({ user: 1, itemType: 1, item: 1 }, { unique: true });

const FavoriteModel = mongoose.model("Favorite", favoriteSchema);

export default FavoriteModel;
