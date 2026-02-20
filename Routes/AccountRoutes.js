import {
  createUser,
  verifyOTP,
  resendOTP,
  requestPasswordReset,
  resetPassword,
  LogInUser,
  LogInUserAccount,
  LogInOwnerAccount,
  getMe,
  updateUser,
  deleteUser,
} from "../Controller/Accounts.js";
import { verifyToken } from "../Middlewares/jwt.js";
import { uploadProfileImage } from "../Middlewares/profileUpload.js";

const AccountRoutes = (basePath, app) => {
  app.post(`${basePath}/register`, createUser);
  app.post(`${basePath}/verify-otp`, verifyOTP);
  app.post(`${basePath}/resend-otp`, resendOTP);
  app.post(`${basePath}/request-password-reset`, requestPasswordReset);
  app.post(`${basePath}/reset-password`, resetPassword);
  app.post(`${basePath}/login`, LogInUser);
  app.post(`${basePath}/login/user`, LogInUserAccount);
  app.post(`${basePath}/login/owner`, LogInOwnerAccount);

  app.get(`${basePath}/me`, verifyToken, getMe);
  app.put(`${basePath}/:id`, verifyToken, uploadProfileImage, updateUser);
  app.delete(`${basePath}/:id`, verifyToken, deleteUser);
};

export default AccountRoutes;
