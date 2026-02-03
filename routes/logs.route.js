import express from "express";
import rateLimit from "express-rate-limit";
import { log } from "../utils/logger.js";

const router = express.Router();

// Rate limit frontend error logging to prevent abuse
const logLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Max 20 error logs per minute per IP
  message: { success: false, message: "Too many log requests" },
});

/**
 * POST /api/logs/error
 * Receive frontend errors
 */
router.post("/error", logLimiter, (req, res) => {
  try {
    const {
      message,
      stack,
      componentStack,
      url,
      userAgent,
      timestamp,
      extra,
    } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Error message is required",
      });
    }

    log.frontend(
      {
        message,
        stack,
        componentStack,
        pageUrl: url,
        clientUserAgent: userAgent,
        clientTimestamp: timestamp,
        extra,
      },
      req
    );

    res.json({ success: true, message: "Error logged" });
  } catch (error) {
    log.error("Failed to log frontend error", error);
    res.status(500).json({ success: false, message: "Failed to log error" });
  }
});

/**
 * POST /api/logs/event
 * Log frontend analytics/events (optional)
 */
router.post("/event", logLimiter, (req, res) => {
  try {
    const { event, data, timestamp } = req.body;

    if (!event) {
      return res.status(400).json({
        success: false,
        message: "Event name is required",
      });
    }

    log.info(`Frontend Event: ${event}`, {
      type: "frontend-event",
      event,
      data,
      clientTimestamp: timestamp,
      ip: req.headers["x-forwarded-for"]?.split(",")[0] || req.ip,
    });

    res.json({ success: true, message: "Event logged" });
  } catch (error) {
    log.error("Failed to log frontend event", error);
    res.status(500).json({ success: false, message: "Failed to log event" });
  }
});

export default router;
