import { verifyToken } from "../Middlewares/jwt.js";
import { uploadContentFiles, uploadSongFiles } from "../Middlewares/fileUpload.js";
import {
  createSong,
  createContent,
  getOwnerDashboard,
  getOwnerUploads,
  getOwnerStatements,
  listPiracyComplaints,
  createPiracyComplaint,
} from "../Controller/OwnerController.js";

const UPLOAD_ROUTE_TIMEOUT_MS = Number.parseInt(
  process.env.UPLOAD_ROUTE_TIMEOUT_MS || "420000",
  10,
);

const applyUploadRouteTimeout = (req, res, next) => {
  const timeoutMs =
    Number.isFinite(UPLOAD_ROUTE_TIMEOUT_MS) && UPLOAD_ROUTE_TIMEOUT_MS > 0
      ? UPLOAD_ROUTE_TIMEOUT_MS
      : 420000;

  console.log("=== UPLOAD ROUTE TIMEOUT MIDDLEWARE ===");
  console.log("Timeout set to:", timeoutMs, "ms (", Math.ceil(timeoutMs / 1000), "seconds)");
  console.log("Request URL:", req.url);
  console.log("Request method:", req.method);

  req.setTimeout(timeoutMs);
  res.setTimeout(timeoutMs, () => {
    if (res.headersSent) return;
    console.log("=== UPLOAD TIMEOUT TRIGGERED ===");
    res.status(504).json({
      message: `Upload request timed out after ${Math.ceil(timeoutMs / 1000)} seconds`,
    });
  });

  next();
};

const OwnerRoutes = (basePath, app) => {
  app.post(
    `${basePath}/:ownerId/songs`,
    applyUploadRouteTimeout,
    verifyToken,
    uploadSongFiles,
    createSong,
  );
  app.post(
    `${basePath}/:ownerId/contents`,
    applyUploadRouteTimeout,
    verifyToken,
    uploadContentFiles,
    createContent,
  );

  app.get(`${basePath}/:ownerId/dashboard`, verifyToken, getOwnerDashboard);
  app.get(`${basePath}/:ownerId/uploads`, verifyToken, getOwnerUploads);
  app.get(`${basePath}/:ownerId/statements`, verifyToken, getOwnerStatements);

  app.get(`${basePath}/:ownerId/piracy-complaints`, verifyToken, listPiracyComplaints);
  app.post(`${basePath}/:ownerId/piracy-complaints`, verifyToken, createPiracyComplaint);
};

export default OwnerRoutes;
