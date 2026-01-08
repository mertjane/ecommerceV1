import {
  registerCustomer,
  loginCustomer,
  verifyToken,
  refreshToken,
  updateCustomerProfile,
} from "../services/auth.service.js";
import { successResponse, handleError } from "../utils/response.js";

/**
 * Register a new customer
 * POST /api/auth/register
 */
export const register = async (req, res) => {
  try {
    const { email, password, first_name, last_name } = req.body;

    // Validate required fields
    if (!email || !password) {
      return handleError(res, "Email and password are required", 400);
    }

    const result = await registerCustomer(email, password);

    // Update profile with names if provided
    if (first_name || last_name) {
      await updateCustomerProfile(result.customer.id, {
        first_name,
        last_name,
      });
    }

    return successResponse(res, result, "Registration successful", 201);
  } catch (error) {
    console.error("Register controller error:", error);
    return handleError(res, error.message || "Registration failed", 400);
  }
};

/**
 * Login customer
 * POST /api/auth/login
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return handleError(res, "Email and password are required", 400);
    }

    const result = await loginCustomer(email, password);

    return successResponse(res, result, "Login successful");
  } catch (error) {
    console.error("Login controller error:", error);
    return handleError(res, error.message || "Login failed", 401);
  }
};

/**
 * Get current user
 * GET /api/auth/me
 */
export const getCurrentUser = async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return handleError(res, "No token provided", 401);
    }

    const result = await verifyToken(token);

    return successResponse(res, result, "User retrieved successfully");
  } catch (error) {
    console.error("Get current user error:", error);
    return handleError(res, error.message || "Authentication failed", 401);
  }
};

/**
 * Refresh authentication token
 * POST /api/auth/refresh
 */
export const refresh = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return handleError(res, "Token is required", 400);
    }

    const result = await refreshToken(token);

    return successResponse(res, result, "Token refreshed successfully");
  } catch (error) {
    console.error("Refresh token error:", error);
    return handleError(res, error.message || "Token refresh failed", 401);
  }
};

/**
 * Update customer profile
 * PUT /api/auth/profile
 */
export const updateProfile = async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return handleError(res, "No token provided", 401);
    }

    // Verify token and get user ID
    const { customer } = await verifyToken(token);

    // Update profile with provided data
    const updateData = req.body;
    delete updateData.password; // Don't allow password updates through this endpoint

    const result = await updateCustomerProfile(customer.id, updateData);

    return successResponse(res, result, "Profile updated successfully");
  } catch (error) {
    console.error("Update profile error:", error);
    return handleError(res, error.message || "Profile update failed", 400);
  }
};

/**
 * Logout (client-side token removal)
 * POST /api/auth/logout
 */
export const logout = async (req, res) => {
  try {
    // For JWT-based auth, logout is handled client-side by removing the token
    // This endpoint can be used for logging purposes or future session management

    return successResponse(
      res,
      { message: "Logout successful" },
      "Please remove the token from client storage"
    );
  } catch (error) {
    console.error("Logout error:", error);
    return handleError(res, error.message || "Logout failed", 400);
  }
};
