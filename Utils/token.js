const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Session = require("../Modals/Session");

const ACCESS_SECRET =
  process.env.ACCESS_SECRET ||
  process.env.JWT_SECRET ||
  "nurturely_fallback_dev_access_secret_2026";
const REFRESH_SECRET =
  process.env.REFRESH_SECRET ||
  process.env.JWT_SECRET ||
  "nurturely_fallback_dev_refresh_secret_2026";

const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user._id || user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    },
    ACCESS_SECRET,
    {
      expiresIn: "15m",
      algorithm: "HS256",
    }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      id: user._id || user.id,
    },
    REFRESH_SECRET,
    {
      expiresIn: "7d",
      algorithm: "HS256",
    }
  );
};

const sendTokenResponse = async (user, statusCode, res, message = "Success", req = null) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Persist session to MongoDB
  try {
    const userAgent = req?.headers?.["user-agent"] || "Browser";
    const ip = req?.ip || req?.connection?.remoteAddress || "";
    await Session.create({
      user: user._id || user.id,
      refreshTokenHash,
      userAgent,
      ip,
      expiresAt,
    });
  } catch (err) {
    // If sessions table not ready or unique index collision, continue gracefully
  }

  const isProduction = process.env.NODE_ENV === "production";
  const isHttps = req ? (Boolean(req.secure) || req.headers?.["x-forwarded-proto"] === "https") : false;
  const secure = isProduction ? isHttps : false;
  const sameSite = secure ? "none" : "lax";

  // HTTP-only cookie for refresh token
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // Also set accessToken cookie
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: 15 * 60 * 1000,
  });

  return res.status(statusCode).json({
    success: true,
    message,
    accessToken,
    user: {
      id: user._id || user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      companyName: user.companyName || "",
      phone: user.phone || "",
      avatar: user.avatar || "",
      isActive: user.isActive,
    },
  });
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  sendTokenResponse,
  hashToken,
  ACCESS_SECRET,
  REFRESH_SECRET,
};
