import express from "express";
import cors from "cors";
import { createServer } from "http";
import dotenv from "dotenv";
import passport from "passport";
import RoutesIndex from "./Routes/RoutesIndex.js";
import connectDB from "./Config/DataBase.js";
import configureGoogleStrategy from "./Config/googleStrategy.js";
import { generateToken } from "./Middlewares/jwt.js";

dotenv.config();
connectDB();
configureGoogleStrategy();

const app = express();
const httpServer = createServer(app);

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((value) => value.trim())
  : "*";

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  }),
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect:
      String(process.env.GOOGLE_FAILURE_REDIRECT_URL || "").trim() ||
      "http://localhost:5173/user/login",
    session: false,
  }),
  (req, res) => {
    try {
      const user = req.user;
      const userId = String(user?._id || "");

      if (!user || !userId) {
        const failureRedirect =
          String(process.env.GOOGLE_FAILURE_REDIRECT_URL || "").trim() ||
          "http://localhost:5173/user/login";
        return res.redirect(failureRedirect);
      }

      const token = generateToken({
        id: userId,
        email: user.email,
        role: user.role,
      });

      const sessionUser = {
        id: userId,
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

      const successRedirectBase =
        String(process.env.GOOGLE_SUCCESS_REDIRECT_URL || "").trim() ||
        "http://localhost:5173/auth/google/success";
      const successRedirectUrl = new URL(successRedirectBase);
      successRedirectUrl.searchParams.set("token", token);
      successRedirectUrl.searchParams.set("user", JSON.stringify(sessionUser));

      return res.redirect(successRedirectUrl.toString());
    } catch (error) {
      console.error("Google callback failed:", error);
      const failureRedirect =
        String(process.env.GOOGLE_FAILURE_REDIRECT_URL || "").trim() ||
        "http://localhost:5173/user/login";
      return res.redirect(failureRedirect);
    }
  },
);

RoutesIndex(app);

const PORT = process.env.PORT || 5000;

httpServer.timeout = 600000;
httpServer.keepAliveTimeout = 610000;
httpServer.headersTimeout = 620000;

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Server timeout set to: ${httpServer.timeout}ms`);
});
