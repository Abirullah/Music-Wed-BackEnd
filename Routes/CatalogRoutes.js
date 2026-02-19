import {
  getCatalogItems,
  getCatalogItemById,
  getArtistsCollection,
  reportPiracyByItem,
  reportPiracyByName,
  getTopOwnerInsights,
} from "../Controller/CatalogController.js";
import { verifyToken } from "../Middlewares/jwt.js";

const CatalogRoutes = (basePath, app) => {
  app.get(`${basePath}`, getCatalogItems);
  app.get(`${basePath}/artists`, getArtistsCollection);
  app.get(`${basePath}/top-owner-insights`, getTopOwnerInsights);
  app.post(`${basePath}/report-piracy`, verifyToken, reportPiracyByName);
  app.get(`${basePath}/:itemType/:itemId`, getCatalogItemById);
  app.post(`${basePath}/:itemType/:itemId/report-piracy`, verifyToken, reportPiracyByItem);
};

export default CatalogRoutes;
