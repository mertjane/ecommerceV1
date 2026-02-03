import rateLimit from "express-rate-limit";

/**
 * Rate limiter for placing orders
 * Business standard: Prevent fraud and abuse
 * 5 order attempts per 15 minutes per IP
 */
export const placeOrderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    success: false,
    message: "Too many order attempts. Please try again in 15 minutes.",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests
  keyGenerator: (req) => {
    // Use X-Forwarded-For if behind a proxy, otherwise use IP
    return req.headers["x-forwarded-for"]?.split(",")[0] || req.ip;
  },
});

/**
 * Rate limiter for order retrieval
 * More permissive since it's read-only
 * 30 requests per minute per IP
 */
export const getOrderLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: {
    success: false,
    message: "Too many requests. Please slow down.",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.headers["x-forwarded-for"]?.split(",")[0] || req.ip;
  },
});

/**
 * Rate limiter for order confirmation
 * Moderate limit - may need retries
 * 10 requests per 15 minutes per IP
 */
export const confirmOrderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    success: false,
    message: "Too many confirmation attempts. Please try again later.",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.headers["x-forwarded-for"]?.split(",")[0] || req.ip;
  },
});

/**
 * Rate limiter for payment gateways retrieval
 * Read-only, more permissive
 * 20 requests per minute per IP
 */
export const paymentGatewaysLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: {
    success: false,
    message: "Too many requests. Please slow down.",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.headers["x-forwarded-for"]?.split(",")[0] || req.ip;
  },
});
