import { verifyToken } from "../Middlewares/jwt.js";
import {
  createCheckoutSession,
  confirmCheckout,
  getPurchaseStatus,
} from "../Controller/PaymentController.js";

const PaymentRoutes = (basePath, app) => {
  app.post(`${basePath}/checkout-session`, verifyToken, createCheckoutSession);
  app.post(`${basePath}/confirm`, verifyToken, confirmCheckout);
  app.get(`${basePath}/purchases/:purchaseId`, verifyToken, getPurchaseStatus);
};

export default PaymentRoutes;
