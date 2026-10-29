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
      expiresIn: "2h",
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
      expiresIn: "30d",
      algorithm: "HS256",
    }
  );
};

const getCookieOptions = (req, maxAge) => {
  const origin = (req?.headers?.origin || "").toLowerCase();
  const host = (req?.headers?.host || "").toLowerCase();
  const isLocalhost =
    origin.includes("localhost") ||
    origin.includes("127.0.0.1") ||
    host.includes("localhost") ||
    host.includes("127.0.0.1");

  const isHttps = req
    ? Boolean(req.secure) || req.headers?.["x-forwarded-proto"] === "https"
    : false;

  let secure = false;
  let sameSite = "lax";
  let cookieDomain = undefined;

  if (isLocalhost) {
    // When on localhost or local IP, do not assign external domain and do not force secure over plain http
    secure = isHttps;
    sameSite = isHttps ? "none" : "lax";
    cookieDomain = undefined;
  } else {
    // Remote production domain
    secure = true;
    sameSite = "none";
    if (process.env.COOKIE_DOMAIN) {
      cookieDomain = process.env.COOKIE_DOMAIN;
    } else if (
      host.includes("rohitdevstack.online") ||
      origin.includes("rohitdevstack.online")
    ) {
      cookieDomain = ".rohitdevstack.online";
    }
  }

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    ...(maxAge !== undefined ? { maxAge } : {}),
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  };
};

const sendTokenResponse = async (
  user,
  statusCode,
  res,
  message = "Success",
  req = null
) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

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

  // HTTP-only cookie for refresh token (30 days)
  res.cookie(
    "refreshToken",
    refreshToken,
    getCookieOptions(req, 30 * 24 * 60 * 60 * 1000)
  );

  // Also set accessToken cookie (2 hours)
  res.cookie(
    "accessToken",
    accessToken,
    getCookieOptions(req, 2 * 60 * 60 * 1000)
  );

  return res.status(statusCode).json({
    success: true,
    message,
    accessToken,
    refreshToken,
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
  getCookieOptions,
  hashToken,
  ACCESS_SECRET,
  REFRESH_SECRET,
};
