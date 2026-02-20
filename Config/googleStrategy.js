import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import UserModel from "../Models/UserModel.js";

const GOOGLE_PASSWORD_SALT_ROUNDS = 10;
const normalizeGoogleRoleContext = (value) =>
  String(value || "user").toLowerCase() === "owner" ? "owner" : "user";

const createGooglePassword = async () => {
  const randomSeed = `${Date.now()}-${Math.random()}-google-oauth`;
  return bcrypt.hash(randomSeed, GOOGLE_PASSWORD_SALT_ROUNDS);
};

const configureGoogleStrategy = () => {
  const clientID = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
  const callbackURL =
    String(process.env.GOOGLE_CALLBACK_URL || "").trim() || "/auth/google/callback";

  if (!clientID || !clientSecret) {
    console.warn(
      "Google OAuth is disabled because GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.",
    );
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL,
        passReqToCallback: true,
      },
      async (req, _accessToken, _refreshToken, profile, done) => {
        try {
          const requestedRole = normalizeGoogleRoleContext(req?.query?.state);
          const email = String(profile?.emails?.[0]?.value || "")
            .trim()
            .toLowerCase();

          if (!email) {
            return done(new Error("Google account email is required for login."));
          }

          let user = await UserModel.findOne({ email });
          const googleAvatar = String(profile?.photos?.[0]?.value || "").trim() || null;

          if (!user) {
            user = await UserModel.create({
              name: String(profile.displayName || email.split("@")[0] || "Google User").trim(),
              email,
              password: await createGooglePassword(),
              role: requestedRole === "owner" ? "owner" : "user",
              isActive: true,
              profilePicture: googleAvatar,
            });
          } else {
            let shouldSave = false;
            if (user.isActive === false) {
              user.isActive = true;
              shouldSave = true;
            }
            if (!user.profilePicture && googleAvatar) {
              user.profilePicture = googleAvatar;
              shouldSave = true;
            }

            if (shouldSave) {
              await user.save();
            }
          }

          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      },
    ),
  );
};

export default configureGoogleStrategy;
