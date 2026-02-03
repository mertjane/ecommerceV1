import rateLimit from "express-rate-limit";

/**
 * Rate limiter for Stripe config retrieval
 * Read-only endpoint, more permissive
 * 30 requests per minute per IP
 */
export const stripeConfigLimiter = rateLimit({
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
 * Rate limiter for creating payment intents
 * Business standard: Prevent payment fraud
 * 10 payment intent creations per 15 minutes per IP
 */
export const createPaymentIntentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    success: false,
    message: "Too many payment attempts. Please try again in 15 minutes.",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    return req.headers["x-forwarded-for"]?.split(",")[0] || req.ip;
  },
});

/**
 * Rate limiter for confirming payments
 * Slightly more permissive - may need retries on network issues
 * 20 confirmation attempts per 15 minutes per IP
 */
export const confirmPaymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: {
    success: false,
    message: "Too many payment confirmation attempts. Please try again later.",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.headers["x-forwarded-for"]?.split(",")[0] || req.ip;
  },
});

/**
 * Rate limiter for webhooks
 * Webhooks come from payment providers (Stripe, etc.)
 * Very permissive - provider may send multiple events
 * 100 requests per minute per IP
 */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: {
    success: false,
    message: "Webhook rate limit exceeded.",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.headers["x-forwarded-for"]?.split(",")[0] || req.ip;
  },
});
