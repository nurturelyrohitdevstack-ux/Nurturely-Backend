const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../Modals/User");
const EmailOtp = require("../Modals/EmailOtp");
const Session = require("../Modals/Session");
const asyncHandler = require("../Utils/asyncHandler");
const {
  generateAccessToken,
  generateRefreshToken,
  sendTokenResponse,
  getCookieOptions,
  hashToken,
  ACCESS_SECRET,
  REFRESH_SECRET,
} = require("../Utils/token");
const { sendOtpEmail, sendPasswordResetEmail } = require("../Utils/mailer");

// Generate a 6-digit numeric OTP
const generateNumericOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// @desc    Send OTP to email for verification
// @route   POST /api/auth/send-otp
// @access  Public
const sendOtp = asyncHandler(async (req, res) => {
  const { email, purpose = "register" } = req.body;

  if (!email || !email.includes("@")) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid email address.",
    });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // If registering, verify the email is not already in use
  if (purpose === "register") {
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists. Please sign in.",
      });
    }
  }

  // Check cooldown & resend limits on existing OTP
  let emailOtp = await EmailOtp.findOne({ email: normalizedEmail, purpose });

  if (emailOtp) {
    const secondsPassed = Math.floor(
      (Date.now() - emailOtp.lastSentAt.getTime()) / 1000
    );

    if (secondsPassed < 60) {
      return res.status(429).json({
        success: false,
        message: `Please wait ${60 - secondsPassed} seconds before requesting another code.`,
        resendAfter: 60 - secondsPassed,
      });
    }

    if (emailOtp.resendCount >= 5) {
      return res.status(429).json({
        success: false,
        message: "Maximum verification requests reached. Please try again after 5 minutes.",
      });
    }
  }

  // Generate 6-digit OTP
  const otp = generateNumericOtp();
  const hashedOtp = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  if (emailOtp) {
    emailOtp.otp = hashedOtp;
    emailOtp.expiresAt = expiresAt;
    emailOtp.lastSentAt = new Date();
    emailOtp.resendCount += 1;
    emailOtp.attempts = 0;
    emailOtp.verified = false;
    await emailOtp.save();
  } else {
    emailOtp = await EmailOtp.create({
      email: normalizedEmail,
      otp: hashedOtp,
      purpose,
      expiresAt,
      resendCount: 0,
      attempts: 0,
      verified: false,
    });
  }

  // Dispatch OTP email
  await sendOtpEmail({
    to: normalizedEmail,
    otp,
    purpose: purpose === "register" ? "account registration" : purpose,
  });

  res.status(200).json({
    success: true,
    message: `Verification code sent to ${normalizedEmail}.`,
    resendAfter: 60,
  });
});

// @desc    Verify OTP and return signed verification token
// @route   POST /api/auth/verify-otp
// @access  Public
const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp, purpose = "register" } = req.body;

  if (!email || !otp) {
    return res.status(400).json({
      success: false,
      message: "Both email and verification code are required.",
    });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const emailOtp = await EmailOtp.findOne({
    email: normalizedEmail,
    purpose,
  }).select("+otp");

  if (!emailOtp) {
    return res.status(400).json({
      success: false,
      message: "No active verification code found. Please request a new one.",
    });
  }

  if (emailOtp.expiresAt < new Date()) {
    await EmailOtp.deleteOne({ _id: emailOtp._id });
    return res.status(400).json({
      success: false,
      message: "Verification code has expired. Please request a new one.",
    });
  }

  if (emailOtp.attempts >= 5) {
    await EmailOtp.deleteOne({ _id: emailOtp._id });
    return res.status(429).json({
      success: false,
      message: "Too many incorrect attempts. Please request a new code.",
    });
  }

  const isMatch = await bcrypt.compare(otp.trim(), emailOtp.otp);

  if (!isMatch) {
    emailOtp.attempts += 1;
    await emailOtp.save();
    const remaining = 5 - emailOtp.attempts;
    return res.status(400).json({
      success: false,
      message: remaining > 0
        ? `Incorrect verification code. ${remaining} attempt(s) remaining.`
        : "Too many incorrect attempts. Please request a new code.",
    });
  }

  // Code verified! Delete OTP record and sign single-use verification token
  await EmailOtp.deleteOne({ _id: emailOtp._id });

  const verificationToken = jwt.sign(
    {
      email: normalizedEmail,
      purpose,
      verified: true,
    },
    ACCESS_SECRET,
    { expiresIn: "15m" }
  );

  res.status(200).json({
    success: true,
    message: "Email verified successfully!",
    verificationToken,
  });
});

// @desc    Register a new user / workspace admin with OTP verification & session
// @route   POST /api/auth/register (or /api/auth/signup)
// @access  Public
const register = asyncHandler(async (req, res) => {
  const {
    fullName,
    email,
    password,
    companyName,
    phone,
    role,
    verificationToken,
  } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Full name, email address, and password are required.",
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters long.",
    });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Validate verification token
  if (verificationToken) {
    try {
      const decoded = jwt.verify(verificationToken, ACCESS_SECRET);
      if (
        decoded.email !== normalizedEmail ||
        decoded.purpose !== "register" ||
        !decoded.verified
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid email verification token. Please verify your email.",
        });
      }
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: "Email verification expired. Please request a new code.",
      });
    }
  }

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: "An account with this email already exists. Please log in.",
    });
  }

  const totalUsers = await User.countDocuments();
  const userRole =
    totalUsers === 0
      ? "admin"
      : role && ["admin", "sales"].includes(role)
      ? role
      : "admin";

  const user = await User.create({
    fullName: fullName.trim(),
    email: normalizedEmail,
    password,
    companyName: companyName ? companyName.trim() : "",
    phone: phone ? phone.trim() : "",
    role: userRole,
    isActive: true,
  });

  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  // Issue session, access token, and refresh token
  await sendTokenResponse(
    user,
    201,
    res,
    "Account created successfully!",
    req
  );
});

// @desc    Login user with session, access token & refresh token
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Please provide both email and password.",
    });
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
    "+password"
  );

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Invalid email or password.",
    });
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: "Invalid email or password.",
    });
  }

  if (!user.isActive) {
    return res.status(403).json({
      success: false,
      message: "Your account is deactivated. Please contact an administrator.",
    });
  }

  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  // Issue session, access token, and refresh token
  await sendTokenResponse(user, 200, res, "Logged in successfully", req);
});

// @desc    Refresh Access Token & Rotate Session
// @route   POST /api/auth/refresh-token
// @access  Public (via HTTP-only cookie or body)
const refreshToken = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Refresh token is missing.",
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, REFRESH_SECRET, { algorithms: ["HS256"] });
  } catch (err) {
    return res.status(403).json({
      success: false,
      code: "TOKEN-EXPIRE",
      message: "Invalid or expired refresh token. Please log in again.",
    });
  }

  // Validate session in database
  const refreshTokenHash = hashToken(token);
  const session = await Session.findOne({ refreshTokenHash, user: decoded.id });

  if (!session) {
    return res.status(403).json({
      success: false,
      code: "TOKEN-EXPIRE",
      message: "Session expired or terminated. Please log in again.",
    });
  }

  if (session.expiresAt && session.expiresAt <= new Date()) {
    await Session.deleteOne({ _id: session._id });
    return res.status(403).json({
      success: false,
      code: "TOKEN-EXPIRE",
      message: "Session has expired. Please log in again.",
    });
  }

  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) {
    await Session.deleteOne({ _id: session._id });
    return res.status(401).json({
      success: false,
      message: "User account is unavailable.",
    });
  }

  // Rotate tokens
  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);

  session.refreshTokenHash = hashToken(newRefreshToken);
  session.lastActive = new Date();
  session.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await session.save();

  res.cookie(
    "refreshToken",
    newRefreshToken,
    getCookieOptions(req, 30 * 24 * 60 * 60 * 1000)
  );

  res.cookie(
    "accessToken",
    newAccessToken,
    getCookieOptions(req, 2 * 60 * 60 * 1000)
  );

  res.status(200).json({
    success: true,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      companyName: user.companyName || "",
      phone: user.phone || "",
      avatar: user.avatar || "",
      isActive: user.isActive,
    },
  });
});

// @desc    Get Current User Profile & Active Session
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
});

// @desc    Logout User & Invalidate Session
// @route   POST /api/auth/logout
// @access  Public
const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;

  if (token) {
    try {
      const refreshTokenHash = hashToken(token);
      await Session.deleteOne({ refreshTokenHash });
    } catch (err) {
      // Ignore session delete errors
    }
  }

  const clearOptions = {
    ...getCookieOptions(req),
    expires: new Date(0),
  };
  delete clearOptions.maxAge;

  res.cookie("refreshToken", "", clearOptions);
  res.cookie("accessToken", "", clearOptions);

  res.status(200).json({
    success: true,
    message: "Logged out and session terminated successfully",
  });
});

// @desc    Forgot Password
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Please enter your email address.",
    });
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });

  if (!user) {
    return res.status(200).json({
      success: true,
      message:
        "If an account exists with that email, a password reset link has been sent.",
    });
  }

  const resetToken = crypto.randomBytes(32).toString("hex");

  user.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  user.resetPasswordExpire = Date.now() + 60 * 60 * 1000;

  await user.save({ validateBeforeSave: false });

  // Dynamically resolve client URL: prioritize env Frontend_Url, then request origin header
  const reqOrigin = req.get("origin") || req.get("referer");
  let clientUrl = (process.env.Frontend_Url || "").trim();
  if (!clientUrl && reqOrigin) {
    try {
      const parsed = new URL(reqOrigin);
      clientUrl = parsed.origin;
    } catch (e) {
      // Fallback
    }
  }
  if (!clientUrl) {
    clientUrl = "http://localhost:3002";
  }
  clientUrl = clientUrl.replace(/\/+$/, "");

  const resetUrl = `${clientUrl}/reset-password?token=${resetToken}`;

  try {
    await sendPasswordResetEmail({
      to: user.email,
      resetUrl,
      name: user.fullName,
    });

    res.status(200).json({
      success: true,
      message:
        "If an account exists with that email, a password reset link has been sent.",
    });
  } catch (err) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });

    return res.status(500).json({
      success: false,
      message: "Could not send password reset email. Please try again later.",
    });
  }
});

// @desc    Reset Password with token
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "Reset token and new password are required.",
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: "New password must be at least 6 characters.",
    });
  }

  const resetPasswordToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  }).select("+password");

  if (!user) {
    return res.status(400).json({
      success: false,
      message: "Reset token is invalid or has expired.",
    });
  }

  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  user.passwordChangedAt = new Date();
  await user.save();

  // Invalidate any old sessions upon password change for security
  await Session.deleteMany({ user: user._id });

  await sendTokenResponse(
    user,
    200,
    res,
    "Password reset successful. You are now logged in.",
    req
  );
});

// @desc    Update Current User Password
// @route   PUT /api/auth/update-password
// @access  Private
const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "Please provide both current and new passwords.",
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: "New password must be at least 6 characters.",
    });
  }

  const user = await User.findById(req.user.id).select("+password");

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    return res.status(400).json({
      success: false,
      message: "Current password is incorrect.",
    });
  }

  user.password = newPassword;
  user.passwordChangedAt = new Date();
  await user.save();

  // Invalidate other sessions
  await Session.deleteMany({ user: user._id });

  await sendTokenResponse(
    user,
    200,
    res,
    "Password updated successfully.",
    req
  );
});

module.exports = {
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
};
