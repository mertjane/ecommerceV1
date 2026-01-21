import {
  getCustomerOrders,
  getOrderById,
  updateBillingAddress,
  updateShippingAddress,
  updateProfile,
  changePassword,
} from "../services/account.service.js";
import { verifyToken } from "../services/auth.service.js";
import { successResponse, handleError } from "../utils/response.js";

/**
 * Get authenticated customer from request
 */
const getAuthenticatedCustomer = async (req) => {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    throw new Error("No token provided");
  }

  const { customer } = await verifyToken(token);
  return customer;
};

/**
 * Get customer orders
 * GET /api/account/orders
 */
export const getOrders = async (req, res) => {
  try {
    const customer = await getAuthenticatedCustomer(req);
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 10;

    const orders = await getCustomerOrders(customer.id, page, perPage);

    return successResponse(res, orders, "Orders retrieved successfully");
  } catch (error) {
    const status = error.message === "No token provided" ? 401 : 500;
    return handleError(res, error.message || "Failed to get orders", status);
  }
};

/**
 * Get single order
 * GET /api/account/orders/:id
 */
export const getOrder = async (req, res) => {
  try {
    const customer = await getAuthenticatedCustomer(req);
    const orderId = parseInt(req.params.id);

    const order = await getOrderById(orderId, customer.id);

    return successResponse(res, order, "Order retrieved successfully");
  } catch (error) {
    const status = error.message === "No token provided" ? 401 :
                   error.message === "Order not found" ? 404 : 500;
    return handleError(res, error.message || "Failed to get order", status);
  }
};

/**
 * Update billing address
 * PUT /api/account/address/billing
 */
export const updateBilling = async (req, res) => {
  try {
    const customer = await getAuthenticatedCustomer(req);
    const addressData = req.body;

    const updatedCustomer = await updateBillingAddress(customer.id, addressData);

    return successResponse(
      res,
      { customer: updatedCustomer },
      "Billing address updated successfully"
    );
  } catch (error) {
    const status = error.message === "No token provided" ? 401 : 400;
    return handleError(res, error.message || "Failed to update billing address", status);
  }
};

/**
 * Update shipping address
 * PUT /api/account/address/shipping
 */
export const updateShipping = async (req, res) => {
  try {
    const customer = await getAuthenticatedCustomer(req);
    const addressData = req.body;

    const updatedCustomer = await updateShippingAddress(customer.id, addressData);

    return successResponse(
      res,
      { customer: updatedCustomer },
      "Shipping address updated successfully"
    );
  } catch (error) {
    const status = error.message === "No token provided" ? 401 : 400;
    return handleError(res, error.message || "Failed to update shipping address", status);
  }
};

/**
 * Update profile
 * PUT /api/account/profile
 */
export const updateAccountProfile = async (req, res) => {
  try {
    const customer = await getAuthenticatedCustomer(req);
    const profileData = req.body;

    const updatedCustomer = await updateProfile(customer.id, profileData);

    return successResponse(
      res,
      { customer: updatedCustomer },
      "Profile updated successfully"
    );
  } catch (error) {
    const status = error.message === "No token provided" ? 401 : 400;
    return handleError(res, error.message || "Failed to update profile", status);
  }
};

/**
 * Change password
 * POST /api/account/change-password
 */
export const updatePassword = async (req, res) => {
  try {
    const customer = await getAuthenticatedCustomer(req);
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return handleError(res, "Current password and new password are required", 400);
    }

    if (new_password.length < 8) {
      return handleError(res, "Password must be at least 8 characters", 400);
    }

    const result = await changePassword(
      customer.id,
      current_password,
      new_password,
      process.env.WC_SITE_URL
    );

    return successResponse(res, result, "Password changed successfully");
  } catch (error) {
    const status = error.message === "No token provided" ? 401 :
                   error.message === "Current password is incorrect" ? 400 : 500;
    return handleError(res, error.message || "Failed to change password", status);
  }
};
