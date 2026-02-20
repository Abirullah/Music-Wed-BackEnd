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

const normalizeGoogleRoleContext = (value) =>
  String(value || "user").toLowerCase() === "owner" ? "owner" : "user";

const appendQueryParam = (url, key, value) => {
  const separator = String(url).includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
};

const getGoogleFailureRedirect = (requestedRole = "user") => {
  const normalizedRole = normalizeGoogleRoleContext(requestedRole);
  const commonFallback =
    String(process.env.GOOGLE_FAILURE_REDIRECT_URL || "").trim() ||
    "http://localhost:5173/user/login";

  if (normalizedRole === "owner") {
    return (
      String(process.env.GOOGLE_OWNER_FAILURE_REDIRECT_URL || "").trim() ||
      "http://localhost:5173/owner/login"
    );
  }

  return (
    String(process.env.GOOGLE_USER_FAILURE_REDIRECT_URL || "").trim() || commonFallback
  );
};

app.get("/auth/google", (req, res, next) => {
  const requestedRole = normalizeGoogleRoleContext(req.query.role);
  return passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
    state: requestedRole,
  })(req, res, next);
});

app.get(
  "/auth/google/callback",
  (req, res, next) => {
    const requestedRole = normalizeGoogleRoleContext(req.query.state);
    const failureRedirect = getGoogleFailureRedirect(requestedRole);

    return passport.authenticate("google", { session: false }, (error, user) => {
      try {
        if (error || !user) {
          if (error) {
            console.error("Google callback failed:", error);
          }
          return res.redirect(failureRedirect);
        }

        const normalizedUserRole = String(user.role || "").toLowerCase();
        const isRoleAllowed =
          requestedRole === "owner"
            ? ["owner", "admin"].includes(normalizedUserRole)
            : normalizedUserRole === "user";

        if (!isRoleAllowed) {
          const roleMismatchRedirect = appendQueryParam(
            failureRedirect,
            "googleError",
            "role_mismatch",
          );
          return res.redirect(roleMismatchRedirect);
        }

        const userId = String(user._id || "");
        if (!userId) {
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
      } catch (callbackError) {
        console.error("Google callback processing failed:", callbackError);
        return res.redirect(failureRedirect);
      }
    })(req, res, next);
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
