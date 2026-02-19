import { verifyToken } from "../Middlewares/jwt.js";
import {
  getUserFavorites,
  addFavorite,
  removeFavorite,
  getUserPurchases,
  getDownloadLink,
  getUserLibrarySummary,
} from "../Controller/UserLibraryController.js";

const UserLibraryRoutes = (basePath, app) => {
  app.get(`${basePath}/:userId/summary`, verifyToken, getUserLibrarySummary);

  app.get(`${basePath}/:userId/favorites`, verifyToken, getUserFavorites);
  app.post(`${basePath}/:userId/favorites`, verifyToken, addFavorite);
  app.delete(`${basePath}/:userId/favorites/:itemType/:itemId`, verifyToken, removeFavorite);

  app.get(`${basePath}/:userId/purchases`, verifyToken, getUserPurchases);
  app.get(`${basePath}/:userId/download/:itemType/:itemId`, verifyToken, getDownloadLink);
};

export default UserLibraryRoutes;
