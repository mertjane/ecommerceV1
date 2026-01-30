import {
  getShippingZones,
  calculateShippingRates,
  getShippingCountries,
  clearShippingCache,
  selectShippingMethod,
  calculateShippingViaCustomEndpoint,
  calculateShippingWithFallback,
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
 *
 * This endpoint:
 * 1. Gets the local cart
 * 2. Syncs it to WooCommerce Store API
 * 3. Updates customer address to trigger shipping calculation
 * 4. Returns WooCommerce's calculated rates (with all plugins applied)
 *
 * Body: { country, postcode?, state?, city?, address_1? }
 * Headers: x-cart-token (required)
 */
export const calculateShippingHandler = async (req, res) => {
  try {
    const cartToken = getCartToken(req);
    const { country, postcode, state, city, address_1 } = req.body;

    if (!country) {
      return handleError(res, "Country is required", 400);
    }

    if (!cartToken) {
      return handleError(res, "Cart session required", 400);
    }

    // Get cart data from local storage
    const cart = await getCartForCheckout(cartToken);

    if (!cart.items || cart.items.length === 0) {
      return handleError(res, "Cart is empty", 400);
    }

    // Calculate shipping rates using WooCommerce Store API
    // This syncs cart to WC, updates address, and gets calculated rates
    const shippingData = await calculateShippingRates(
      { country, postcode, state, city, address_1 },
      cart.items,
      cartToken
    );

    return successResponse(
      res,
      {
        ...shippingData,
        // Include cart totals for reference
        cartSubtotal: cart.totals.subtotal,
      },
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
 * Select a shipping method
 * POST /api/shipping/select
 *
 * Body: { rateId }
 * Headers: x-cart-token (required)
 */
export const selectShippingHandler = async (req, res) => {
  try {
    const cartToken = getCartToken(req);
    const { rateId } = req.body;

    if (!cartToken) {
      return handleError(res, "Cart session required", 400);
    }

    if (!rateId) {
      return handleError(res, "Rate ID is required", 400);
    }

    const result = await selectShippingMethod(cartToken, rateId);

    return successResponse(res, result, "Shipping method selected successfully");
  } catch (error) {
    return handleError(
      res,
      error.message || "Failed to select shipping method",
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

/**
 * Calculate shipping rates using custom WooCommerce endpoint
 * POST /api/shipping/calculate-direct
 *
 * This endpoint uses the custom as-shipping/v1/calculate endpoint
 * which directly invokes WC_Shipping::calculate_shipping() without
 * requiring session management.
 *
 * Body: { items: [{ productId, variationId?, quantity }], destination: { country, postcode?, state?, city? } }
 */
export const calculateShippingDirectHandler = async (req, res) => {
  try {
    const { items, destination } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return handleError(res, "Cart items are required", 400);
    }

    if (!destination?.country) {
      return handleError(res, "Destination country is required", 400);
    }

    const result = await calculateShippingViaCustomEndpoint(items, destination);

    return successResponse(
      res,
      result,
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
 * Calculate shipping with automatic fallback
 * POST /api/shipping/calculate-smart
 *
 * Tries custom endpoint first (faster), falls back to Store API if needed.
 * Use this for maximum reliability.
 *
 * Body: { country, postcode?, state?, city?, address_1? }
 * Headers: x-cart-token (required for fallback)
 */
export const calculateShippingSmartHandler = async (req, res) => {
  try {
    const cartToken = getCartToken(req);
    const { country, postcode, state, city, address_1 } = req.body;

    if (!country) {
      return handleError(res, "Country is required", 400);
    }

    if (!cartToken) {
      return handleError(res, "Cart session required", 400);
    }

    // Get cart data from local storage
    const cart = await getCartForCheckout(cartToken);

    if (!cart.items || cart.items.length === 0) {
      return handleError(res, "Cart is empty", 400);
    }

    // Use smart fallback calculation
    const shippingData = await calculateShippingWithFallback(
      { country, postcode, state, city, address_1 },
      cart.items,
      cartToken
    );

    return successResponse(
      res,
      {
        ...shippingData,
        cartSubtotal: cart.totals.subtotal,
      },
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
