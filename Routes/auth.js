const express = require("express");
const router = express.Router();
const {
  sendOtp,
  verifyOtp,
  register,
  login,
  refreshToken,
  getMe,
  logout,
  forgotPassword,
  resetPassword,
  updatePassword,
} = require("../Controllers/authController");
const protect = require("../Middleware/protect");
const rateLimiter = require("../Middleware/rateLimiter");

// Public endpoints
router.post("/send-otp", rateLimiter({ max: 15, windowMs: 15 * 60 * 1000 }), sendOtp);
router.post("/verify-otp", rateLimiter({ max: 25, windowMs: 15 * 60 * 1000 }), verifyOtp);
router.post("/register", rateLimiter({ max: 30, windowMs: 15 * 60 * 1000 }), register);
router.post("/signup", rateLimiter({ max: 30, windowMs: 15 * 60 * 1000 }), register);
router.post("/login", rateLimiter({ max: 50, windowMs: 15 * 60 * 1000 }), login);
router.post("/refresh-token", refreshToken);
router.post("/logout", logout);
router.post(
  "/forgot-password",
  rateLimiter({ max: 10, windowMs: 15 * 60 * 1000 }),
  forgotPassword
);
router.post("/reset-password", resetPassword);

// Protected endpoints
router.get("/me", protect, getMe);
router.put("/update-password", protect, updatePassword);

module.exports = router;
