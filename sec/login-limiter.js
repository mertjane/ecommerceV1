import rateLimit from "express-rate-limit";

export const loginLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,  // 1 minute
    max: 5,                   // max 5 request  
    message: {
        message: "Too many login attempts, please try again later"
    }
});

