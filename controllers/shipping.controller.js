import {
  getShippingZones,
  calculateShippingRates,
  getShippingCountries,
  clearShippingCache,
} from "../services/shipping.service.js";
import { getCartForCheckout } from "../services/cart.service.js";
import { successResponse, handleError } from "../utils/response.js";

/**
 * Extract cart token from request headers
 */
const getCartToken = (req) => {
  return req.headers["x-cart-token"] || null;
};

/**
 * Get all shipping zones
 * GET /api/shipping/zones
 */
export const getShippingZonesHandler = async (req, res) => {
  try {
    const zones = await getShippingZones();

    return successResponse(res, { zones }, "Shipping zones retrieved successfully");
  } catch (error) {
    return handleError(
      res,
      error.message || "Failed to get shipping zones",
      error.status || 500
    );
  }
};

/**
 * Calculate shipping rates for address
 * POST /api/shipping/calculate
 * Body: { country, postcode?, state?, city? }
 */
export const calculateShippingHandler = async (req, res) => {
  try {
    const cartToken = getCartToken(req);
    const { country, postcode, state, city } = req.body;

    if (!country) {
      return handleError(res, "Country is required", 400);
    }

    if (!cartToken) {
      return handleError(res, "Cart session required", 400);
    }

    // Get cart data
    const cart = await getCartForCheckout(cartToken);

    // Calculate shipping rates
    const shippingData = await calculateShippingRates(
      { country, postcode, state, city },
      cart.items,
      cart.totals.subtotal
    );

    return successResponse(
      res,
      shippingData,
      "Shipping rates calculated successfully"
    );
  } catch (error) {
    return handleError(
      res,
      error.message || "Failed to calculate shipping rates",
      error.status || 500
    );
  }
};

/**
 * Get available shipping countries
 * GET /api/shipping/countries
 */
export const getShippingCountriesHandler = async (req, res) => {
  try {
    const countries = await getShippingCountries();

    return successResponse(
      res,
      { countries },
      "Shipping countries retrieved successfully"
    );
  } catch (error) {
    return handleError(
      res,
      error.message || "Failed to get shipping countries",
      error.status || 500
    );
  }
};

/**
 * Clear shipping cache (admin only - would need auth middleware in production)
 * POST /api/shipping/cache/clear
 */
export const clearShippingCacheHandler = async (req, res) => {
  try {
    await clearShippingCache();

    return successResponse(res, null, "Shipping cache cleared successfully");
  } catch (error) {
    return handleError(
      res,
      error.message || "Failed to clear shipping cache",
      error.status || 500
    );
  }
};
