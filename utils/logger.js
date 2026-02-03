import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log directory
const LOG_DIR = path.join(__dirname, "../logs");

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : "";
    return `[${timestamp}] ${level}: ${message} ${metaStr}`;
  })
);

// Custom format for file output (JSON for easy parsing)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Daily rotate transport for error logs
const errorRotateTransport = new DailyRotateFile({
  filename: path.join(LOG_DIR, "error-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  level: "error",
  maxSize: "20m",      // Max 20MB per file
  maxFiles: "30d",     // Keep logs for 30 days
  format: fileFormat,
});

// Daily rotate transport for combined logs
const combinedRotateTransport = new DailyRotateFile({
  filename: path.join(LOG_DIR, "combined-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  maxSize: "20m",
  maxFiles: "14d",     // Keep combined logs for 14 days
  format: fileFormat,
});

// Daily rotate transport for request logs
const requestRotateTransport = new DailyRotateFile({
  filename: path.join(LOG_DIR, "requests-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  maxSize: "50m",      // Requests can be larger
  maxFiles: "7d",      // Keep for 7 days
  format: fileFormat,
});

// Main logger
const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  defaultMeta: { service: "ecomm-backend" },
  transports: [
    errorRotateTransport,
    combinedRotateTransport,
  ],
});

// Request logger (separate for HTTP requests)
const requestLogger = winston.createLogger({
  level: "info",
  defaultMeta: { service: "ecomm-backend" },
  transports: [requestRotateTransport],
});

// Add console output in development
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// Helper methods for structured logging
export const log = {
  // General info
  info: (message, meta = {}) => logger.info(message, meta),

  // Debug (only in development)
  debug: (message, meta = {}) => logger.debug(message, meta),

  // Warnings
  warn: (message, meta = {}) => logger.warn(message, meta),

  // Errors
  error: (message, error = null, meta = {}) => {
    const errorMeta = error instanceof Error
      ? {
          ...meta,
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
        }
      : { ...meta, error };
    logger.error(message, errorMeta);
  },

  // HTTP Request logging
  request: (req, res, duration) => {
    requestLogger.info("HTTP Request", {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.headers["x-forwarded-for"]?.split(",")[0] || req.ip,
      userAgent: req.headers["user-agent"],
    });
  },

  // Frontend error logging
  frontend: (errorData, req) => {
    logger.error("Frontend Error", {
      type: "frontend",
      ...errorData,
      ip: req.headers["x-forwarded-for"]?.split(",")[0] || req.ip,
      userAgent: req.headers["user-agent"],
    });
  },

  // Payment/Checkout specific logging
  payment: (action, data) => {
    logger.info(`Payment: ${action}`, {
      type: "payment",
      action,
      ...data,
    });
  },

  // Security events
  security: (event, data) => {
    logger.warn(`Security: ${event}`, {
      type: "security",
      event,
      ...data,
    });
  },
};

export default logger;
