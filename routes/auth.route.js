import express from "express";
import {
  register,
  login,
  getCurrentUser,
  refresh,
  updateProfile,
  logout,
} from "../controllers/auth.controller.js";
import { loginLimiter } from "../sec/login-limiter.js";
import { registerLimiter } from "../sec/register-limiter.js";

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new customer
 * @access  Public
 */
router.post("/register", registerLimiter, register);

/**
 * @route   POST /api/auth/login
 * @desc    Login customer
 * @access  Public
 */
router.post("/login", loginLimiter, login);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user
 * @access  Private (requires Bearer token)
 */
router.get("/me", getCurrentUser);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh authentication token
 * @access  Public
 */
router.post("/refresh", refresh);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update customer profile
 * @access  Private (requires Bearer token)
 */
router.put("/profile", updateProfile);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout (client-side token removal)
 * @access  Public
 */
router.post("/logout", logout);

export default router;
