import AccountRoutes from "./AccountRoutes.js";
import OwnerRoutes from "./OwnerRoutes.js";
import CatalogRoutes from "./CatalogRoutes.js";
import UserLibraryRoutes from "./UserLibraryRoutes.js";
import PaymentRoutes from "./PaymentRoutes.js";

const RoutesIndex = (app) => {
  app.get("/health", (_req, res) => {
    res.status(200).json({ message: "Music backend is running" });
  });

  AccountRoutes("/accounts", app);
  OwnerRoutes("/owners", app);
  CatalogRoutes("/catalog", app);
  UserLibraryRoutes("/users", app);
  PaymentRoutes("/payments", app);
};

export default RoutesIndex;
