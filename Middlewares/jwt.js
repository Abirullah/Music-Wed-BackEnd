import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const secretKey = process.env.JWT_SECRET_KEY;
const TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "5h";

const ensureSecret = () => {
  if (!secretKey) {
    throw new Error("JWT_SECRET_KEY is missing in environment variables");
  }
};

export const generateToken = (payload) => {
  ensureSecret();
  return jwt.sign(payload, secretKey, { expiresIn: TOKEN_EXPIRES_IN });
};

export const verifyToken = (req, res, next) => {
  ensureSecret();
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return res.status(401).json({ message: "Authorization token is missing" });
  }

  try {
    req.user = jwt.verify(token, secretKey);
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
