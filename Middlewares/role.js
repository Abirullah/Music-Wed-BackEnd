export const requireRole = (...roles) => {
  return (req, res, next) => {
    const userRole = String(req.user?.role || "").toLowerCase();

    if (!roles.map((role) => String(role).toLowerCase()).includes(userRole)) {
      return res.status(403).json({ message: "Forbidden: insufficient role" });
    }

    return next();
  };
};

export const requireSelfOrRole = (role = "admin") => {
  return (req, res, next) => {
    const requesterId = String(req.user?.id || "");
    const paramId = String(req.params.id || req.params.userId || req.params.ownerId || "");
    const userRole = String(req.user?.role || "").toLowerCase();

    if (requesterId && paramId && requesterId === paramId) {
      return next();
    }

    if (userRole === String(role).toLowerCase()) {
      return next();
    }

    return res.status(403).json({ message: "Forbidden: access denied" });
  };
};
