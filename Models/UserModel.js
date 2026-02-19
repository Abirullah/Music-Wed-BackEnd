import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["user", "owner", "admin"],
      default: "user",
      index: true,
    },
    profilePicture: {
      type: String,
      default: null,
    },
    otpCode: {
      type: String,
      default: null,
    },
    otpPurpose: {
      type: String,
      enum: ["signup", "password_reset"],
      default: null,
    },
    otpExpiresAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    profilePicture: this.profilePicture,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const UserModel = mongoose.model("User", userSchema);

export default UserModel;
