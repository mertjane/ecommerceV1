/**
 * Conditional Shipping Service
 *
 * NOTE: This service is now deprecated.
 *
 * With the new WooCommerce Store API architecture, all conditional shipping
 * logic (Flexible Shipping, Conditional Shipping plugins) is handled natively
 * by WooCommerce when we call the `/wc/store/v1/cart/update-customer` endpoint.
 *
 * The shipping.service.js now:
 * 1. Syncs local cart to WooCommerce Store API
 * 2. Updates customer address
 * 3. WooCommerce runs all shipping plugins natively
 * 4. Returns calculated rates with all conditions applied
 *
 * This file is kept for backwards compatibility but its functions are no longer used.
 */

import redis from "../config/redis.js";

/**
 * Clear conditional shipping cache
 * Kept for backwards compatibility
 */
export const clearConditionalShippingCache = async () => {
  try {
    await redis.del("conditional:shipping:rules");
    return true;
  } catch (error) {
    console.error("Failed to clear conditional shipping cache:", error.message);
    return false;
  }
};

/**
 * @deprecated - No longer needed. WooCommerce handles this natively via Store API.
 */
export const applyConditionalShippingRules = async (methods, cartItems) => {
  // Simply return methods as-is - WooCommerce handles all conditions
  return methods;
};

/**
 * @deprecated - No longer needed. WooCommerce handles this natively via Store API.
 */
export const getConditionalShippingRules = async () => {
  return [];
};
