import bcrypt from "bcrypt";
import UserModel from "../Models/UserModel.js";
import { generateToken } from "../Middlewares/jwt.js";
import { sendOtpEmail } from "../Config/EmailService.js";

const SALT_ROUNDS = 10;
const OTP_LENGTH = 4;
const OTP_EXPIRY_MINUTES = 10;

const OTP_PURPOSE_SIGNUP = "signup";
const OTP_PURPOSE_PASSWORD_RESET = "password_reset";
const OTP_PURPOSES = [OTP_PURPOSE_SIGNUP, OTP_PURPOSE_PASSWORD_RESET];

const normalizeRole = (role, { allowAdmin = false } = {}) => {
  const value = String(role || "user").toLowerCase();
  if (value === "owner") return value;
  if (allowAdmin && value === "admin") return value;
  return "user";
};

const normalizeOtpPurpose = (purpose, fallback = OTP_PURPOSE_SIGNUP) => {
  const value = String(purpose || fallback).toLowerCase();
  return OTP_PURPOSES.includes(value) ? value : fallback;
};

const serializeUser = (userDoc) => {
  const user = typeof userDoc.toObject === "function" ? userDoc.toObject() : userDoc;
  return {
    id: String(user._id),
    fullName: user.name,
    name: user.name,
    email: user.email,
    role: user.role,
    Role: user.role,
    profilePicture: user.profilePicture || null,
    isActive: user.isActive !== false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

const validatePassword = (password = "") => {
  if (String(password).length < 8) {
    return "Password must be at least 8 characters";
  }
  return null;
};

const generateOtp = (length = OTP_LENGTH) => {
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += String(Math.floor(Math.random() * 10));
  }
  return code;
};

const clearOtp = (user) => {
  user.otpCode = null;
  user.otpPurpose = null;
  user.otpExpiresAt = null;
};

const isOtpExpired = (otpExpiresAt) => {
  const expiresAtMs = new Date(otpExpiresAt || 0).getTime();
  return !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now();
};

const issueOtpForUser = async (user, purpose) => {
  const otpPurpose = normalizeOtpPurpose(purpose);
  const otpCode = generateOtp();
  const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  user.otpCode = otpCode;
  user.otpPurpose = otpPurpose;
  user.otpExpiresAt = otpExpiresAt;
  await user.save();

  const emailSent = await sendOtpEmail({
    to: user.email,
    name: user.name,
    otp: otpCode,
    purpose: otpPurpose,
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  });

  if (!emailSent) {
    throw new Error("Unable to send OTP email. Please configure email credentials.");
  }
};

export const createUser = async (req, res) => {
  try {
    const name = String(req.body.name || req.body.fullName || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const role = normalizeRole(req.body.role || req.body.Role);

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const existingUser = await UserModel.findOne({ email });

    if (existingUser && existingUser.isActive !== false) {
      return res.status(409).json({ message: "User already exists" });
    }

    if (existingUser && existingUser.isActive === false) {
      existingUser.name = name;
      existingUser.password = hashedPassword;
      existingUser.role = role;
      await issueOtpForUser(existingUser, OTP_PURPOSE_SIGNUP);

      return res.status(200).json({
        message: "Account exists but is not verified. A new OTP has been sent.",
        requiresVerification: true,
        email: existingUser.email,
        role: existingUser.role,
      });
    }

    const newUser = await UserModel.create({
      name,
      email,
      password: hashedPassword,
      role,
      isActive: false,
    });

    await issueOtpForUser(newUser, OTP_PURPOSE_SIGNUP);

    return res.status(201).json({
      message: "Signup successful. Please verify OTP sent to your email.",
      requiresVerification: true,
      email: newUser.email,
      role: newUser.role,
    });
  } catch (error) {
    console.error("Error creating user:", error);
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const otp = String(req.body.otp || "").trim();
    const purpose = normalizeOtpPurpose(req.body.purpose, OTP_PURPOSE_SIGNUP);

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.otpCode || !user.otpPurpose || !user.otpExpiresAt) {
      return res.status(400).json({ message: "No active OTP found. Please request a new OTP." });
    }

    if (normalizeOtpPurpose(user.otpPurpose, "") !== purpose) {
      return res.status(400).json({ message: "OTP purpose mismatch. Request a new OTP." });
    }

    if (isOtpExpired(user.otpExpiresAt)) {
      clearOtp(user);
      await user.save();
      return res.status(400).json({ message: "OTP expired. Please request a new OTP." });
    }

    if (String(user.otpCode) !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (purpose === OTP_PURPOSE_SIGNUP) {
      user.isActive = true;
      clearOtp(user);
      await user.save();

      const token = generateToken({
        id: String(user._id),
        email: user.email,
        role: user.role,
      });

      return res.status(200).json({
        message: "Account verified successfully",
        token,
        user: serializeUser(user),
      });
    }

    return res.status(200).json({
      message: "OTP verified successfully. You can now reset your password.",
      email: user.email,
      purpose,
      otp,
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const resendOTP = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const purpose = normalizeOtpPurpose(req.body.purpose, OTP_PURPOSE_SIGNUP);

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (purpose === OTP_PURPOSE_SIGNUP && user.isActive !== false) {
      return res.status(400).json({ message: "Account is already verified" });
    }

    if (purpose === OTP_PURPOSE_PASSWORD_RESET && user.isActive === false) {
      return res.status(403).json({ message: "Please verify your account first." });
    }

    await issueOtpForUser(user, purpose);

    return res.status(200).json({
      message: "OTP sent successfully",
      email: user.email,
      purpose,
    });
  } catch (error) {
    console.error("Error resending OTP:", error);
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

export const requestPasswordReset = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await UserModel.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        message: "Account is not verified. Please verify signup OTP first.",
      });
    }

    await issueOtpForUser(user, OTP_PURPOSE_PASSWORD_RESET);

    return res.status(200).json({
      message: "Password reset OTP sent to your email.",
      email: user.email,
    });
  } catch (error) {
    console.error("Error requesting password reset:", error);
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const otp = String(req.body.otp || "").trim();
    const newPassword = String(req.body.newPassword || req.body.password || "");

    if (!email || !otp || !newPassword) {
      return res
        .status(400)
        .json({ message: "Email, OTP and new password are required" });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.otpPurpose !== OTP_PURPOSE_PASSWORD_RESET || !user.otpCode || !user.otpExpiresAt) {
      return res.status(400).json({ message: "No valid password reset OTP found." });
    }

    if (isOtpExpired(user.otpExpiresAt)) {
      clearOtp(user);
      await user.save();
      return res.status(400).json({ message: "OTP expired. Please request a new OTP." });
    }

    if (String(user.otpCode) !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    clearOtp(user);
    await user.save();

    return res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    console.error("Error resetting password:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const loginWithRoleFilter = async (req, res, allowedRoles = []) => {
  const normalizedAllowedRoles = Array.isArray(allowedRoles)
    ? allowedRoles.map((role) => String(role || "").toLowerCase())
    : [];

  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const user = await UserModel.findOne({ email });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (user.isActive === false) {
    return res.status(403).json({
      message: "Account is not verified. Please verify OTP first.",
      requiresVerification: true,
      email: user.email,
    });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const normalizedUserRole = String(user.role || "").toLowerCase();
  if (
    normalizedAllowedRoles.length > 0 &&
    !normalizedAllowedRoles.includes(normalizedUserRole)
  ) {
    const roleLabel = normalizedAllowedRoles.join(" or ");
    return res
      .status(403)
      .json({ message: `This account is not allowed for ${roleLabel} login` });
  }

  const token = generateToken({
    id: String(user._id),
    email: user.email,
    role: user.role,
  });

  return res.status(200).json({
    message: "Login successful",
    token,
    user: serializeUser(user),
  });
};

export const LogInUser = async (req, res) => {
  try {
    return loginWithRoleFilter(req, res);
  } catch (error) {
    console.error("Error logging in user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const LogInUserAccount = async (req, res) => {
  try {
    return loginWithRoleFilter(req, res, ["user"]);
  } catch (error) {
    console.error("Error logging in user account:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const LogInOwnerAccount = async (req, res) => {
  try {
    return loginWithRoleFilter(req, res, ["owner", "admin"]);
  } catch (error) {
    console.error("Error logging in owner account:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getMe = async (req, res) => {
  try {
    const requesterId = String(req.user?.id || "");
    const user = await UserModel.findById(requesterId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ user: serializeUser(user) });
  } catch (error) {
    console.error("Error fetching current user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateUser = async (req, res) => {
  try {
    const userId = String(req.params.id || "");
    const requesterId = String(req.user?.id || "");
    const requesterRole = String(req.user?.role || "").toLowerCase();

    if (!userId) {
      return res.status(400).json({ message: "User id is required" });
    }

    if (requesterId !== userId && requesterRole !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const nextName = String(req.body.name || req.body.fullName || "").trim();
    const nextEmail = String(req.body.email || "").trim().toLowerCase();
    const nextProfilePicture = String(req.body.profilePicture || "").trim();

    if (nextName) user.name = nextName;

    if (nextEmail && nextEmail !== user.email) {
      const existing = await UserModel.findOne({ email: nextEmail, _id: { $ne: user._id } });
      if (existing) {
        return res.status(409).json({ message: "Email already in use" });
      }
      user.email = nextEmail;
    }

    if (nextProfilePicture) {
      user.profilePicture = nextProfilePicture;
    }

    const newPassword = String(req.body.newPassword || req.body.password || "");
    const oldPassword = String(req.body.oldPassword || "");
    if (newPassword) {
      const passwordError = validatePassword(newPassword);
      if (passwordError) {
        return res.status(400).json({ message: passwordError });
      }

      if (requesterRole !== "admin") {
        if (!oldPassword) {
          return res.status(400).json({ message: "Old password is required" });
        }

        const isOldPasswordCorrect = await bcrypt.compare(oldPassword, user.password);
        if (!isOldPasswordCorrect) {
          return res.status(401).json({ message: "Old password is incorrect" });
        }
      }

      user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    }

    if (requesterRole === "admin" && req.body.role) {
      user.role = normalizeRole(req.body.role, { allowAdmin: true });
    }

    await user.save();

    return res.status(200).json({
      message: "User updated successfully",
      user: serializeUser(user),
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const userId = String(req.params.id || "");
    const requesterId = String(req.user?.id || "");
    const requesterRole = String(req.user?.role || "").toLowerCase();

    if (requesterId !== userId && requesterRole !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const deletedUser = await UserModel.findByIdAndDelete(userId);

    if (!deletedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export default {
  createUser,
  verifyOTP,
  resendOTP,
  requestPasswordReset,
  resetPassword,
  LogInUser,
  LogInUserAccount,
  LogInOwnerAccount,
  getMe,
  updateUser,
  deleteUser,
};
