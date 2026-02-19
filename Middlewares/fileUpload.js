const MAX_FILE_SIZE = 100 * 1024 * 1024;

const wrapUploadMiddleware = (middleware, expectedFields = []) => {
  return (req, res, next) => {
    console.log("=== MULTER MIDDLEWARE STARTED ===");
    console.log("Content-Type:", req.headers["content-type"]);
    
    middleware(req, res, (error) => {
      if (!error) {
        console.log("=== MULTER MIDDLEWARE SUCCESS ===");
        console.log("Files processed:", req.files ? Object.keys(req.files) : "No files");
        return next();
      }

      console.log("=== MULTER MIDDLEWARE ERROR ===");
      console.log("Error:", error);
      
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: "Uploaded file exceeds maximum size" });
      }

      if (error.code === "LIMIT_UNEXPECTED_FILE") {
        const expected = expectedFields.length ? expectedFields.join(", ") : "No file fields";
        return res.status(400).json({
          message: `Unexpected file field '${error.field}'. Allowed fields: ${expected}`,
        });
      }

      return res.status(400).json({ message: error.message || "Invalid upload payload" }); 
    });
  };
};

const multerMissingUploadMiddleware = (_req, res) => {
  return res.status(500).json({
    message:
      "Upload middleware is unavailable because 'multer' is not installed. Run 'npm install' in Music-Web-backend and restart the backend.",
  });
};

let uploadSongFiles = multerMissingUploadMiddleware;
let uploadContentFiles = multerMissingUploadMiddleware;

try {
  const multerModule = await import("multer");
  const multer = multerModule.default;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_FILE_SIZE,
    },
  });

  uploadSongFiles = wrapUploadMiddleware(
    upload.fields([
      { name: "musicFile", maxCount: 1 },
      { name: "coverFile", maxCount: 1 },
      { name: "files", maxCount: 2 },
    ]),
    ["musicFile", "coverFile", "files"],
  );

  uploadContentFiles = wrapUploadMiddleware(
    upload.fields([
      { name: "contentFile", maxCount: 1 }, 
      { name: "coverTemplateFile", maxCount: 1 },
    ]),
    ["contentFile", "coverTemplateFile"],
  );
} catch (error) {
  console.error("Failed to initialize multer upload middleware:", error);
}

export { uploadSongFiles, uploadContentFiles };
