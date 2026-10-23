const jwt = require("jsonwebtoken");
const User = require("../Modals/User");
const asyncHandler = require("../Utils/asyncHandler");
const { ACCESS_SECRET } = require("../Utils/token");

const protect = asyncHandler(async (req, res, next) => {
  let token;

  // 1. Authorization header: Bearer <token>
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies && req.cookies.accessToken) {
    // 2. Cookie: accessToken
    token = req.cookies.accessToken;
  }

  if (!token) {
    return res.status(403).json({
      success: false,
      code: "TOKEN-EXPIRE",
      message: "Authentication token is required.",
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, ACCESS_SECRET, {
      algorithms: ["HS256"],
    });
  } catch (error) {
    return res.status(403).json({
      success: false,
      code: "TOKEN-EXPIRE",
      message: "Session expired or invalid token.",
    });
  }

  if (!decoded || !decoded.id) {
    return res.status(403).json({
      success: false,
      code: "TOKEN-EXPIRE",
      message: "Malformed authentication token.",
    });
  }

  const user = await User.findById(decoded.id).select("-password");

  if (!user) {
    return res.status(401).json({
      success: false,
      code: "TOKEN-EXPIRE",
      message: "User account no longer exists.",
    });
  }

  if (!user.isActive) {
    return res.status(403).json({
      success: false,
      message: "Your account has been deactivated. Please contact an administrator.",
    });
  }

  req.user = user;
  next();
});

module.exports = protect;
