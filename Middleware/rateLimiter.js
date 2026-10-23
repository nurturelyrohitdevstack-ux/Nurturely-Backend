// In-memory lightweight rate limiter for login/auth routes
const rateLimits = new Map();

const rateLimiter = (options = {}) => {
  const windowMs = options.windowMs || 15 * 60 * 1000; // 15 mins
  const max = options.max || 100; // 100 requests per IP per window

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || "global";
    const now = Date.now();

    const record = rateLimits.get(ip) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count += 1;
    }

    rateLimits.set(ip, record);

    if (record.count > max) {
      return res.status(429).json({
        success: false,
        message: "Too many requests. Please try again later.",
      });
    }

    next();
  };
};

module.exports = rateLimiter;
