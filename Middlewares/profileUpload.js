import multer from "multer";

const PROFILE_IMAGE_MAX_SIZE_BYTES = 12 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: PROFILE_IMAGE_MAX_SIZE_BYTES,
  },
});

export const uploadProfileImage = (req, res, next) => {
  upload.single("profilePictureFile")(req, res, (error) => {
    if (!error) return next();

    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        message: "Profile image must be smaller than 12MB.",
      });
    }

    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        message: "Invalid image field. Use 'profilePictureFile'.",
      });
    }

    return res.status(400).json({
      message: error.message || "Invalid profile image upload payload.",
    });
  });
};
