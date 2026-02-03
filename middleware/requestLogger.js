import { log } from "../utils/logger.js";

/**
 * HTTP Request logging middleware
 * Logs all incoming requests with timing information
 */
export const requestLoggerMiddleware = (req, res, next) => {
  const startTime = Date.now();

  // Log when response finishes
  res.on("finish", () => {
    const duration = Date.now() - startTime;

    // Skip health check endpoints to reduce noise
    if (req.originalUrl === "/health" || req.originalUrl === "/api/health") {
      return;
    }

    log.request(req, res, duration);

    // Log slow requests as warnings
    if (duration > 5000) {
      log.warn("Slow request detected", {
        url: req.originalUrl,
        method: req.method,
        duration: `${duration}ms`,
      });
    }
  });

  next();
};

/**
 * Error logging middleware
 * Should be added after all routes
 */
export const errorLoggerMiddleware = (err, req, res, next) => {
  log.error("Unhandled error", err, {
    url: req.originalUrl,
    method: req.method,
    body: req.body,
    ip: req.headers["x-forwarded-for"]?.split(",")[0] || req.ip,
  });

  // Pass to default error handler
  next(err);
};
