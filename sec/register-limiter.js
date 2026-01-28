import rateLimit from "express-rate-limit";

export const registerLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 mins
  max: 3,                  // max 3 register
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message:
        "Too many accounts created from this IP. Please try again later."
    });
  }
});
