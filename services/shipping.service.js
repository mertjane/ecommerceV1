import axios from "axios";
import redis from "../config/redis.js";
import crypto from "crypto";

const WC_SITE_URL = process.env.WC_SITE_URL;
const WC_CONSUMER_KEY = process.env.WC_CONSUMER_KEY;
const WC_CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET;
const AS_SHIPPING_API_KEY = process.env.AS_SHIPPING_API_KEY;

// Cache TTL for static data (1 hour)
const SHIPPING_CACHE_TTL = 60 * 60;
// Cache TTL for shipping rates (5 minutes)
const SHIPPING_RATES_CACHE_TTL = 5 * 60;

/**
 * WooCommerce Store API Client
 * The Store API is designed for cart/checkout operations and triggers all shipping hooks
 */
const storeApi = axios.create({
  baseURL: `${WC_SITE_URL}/wp-json/wc/store/v1`,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Session Management for WooCommerce Store API
 * Each shipping calculation needs its own WC session to avoid conflicts
 */
const sessionStorage = new Map();

/**
 * Get or create a WooCommerce session for a cart token
 */
const getWcSession = (cartToken) => {
  return sessionStorage.get(cartToken) || null;
};

/**
 * Save WooCommerce session from response headers
 */
const saveWcSession = (cartToken, response) => {
  const wcSession = response.headers["x-wc-session"] || response.headers["cart-token"];
  if (wcSession) {
    sessionStorage.set(cartToken, wcSession);
  }
};

/**
 * Build headers for Store API request
 */
const buildStoreApiHeaders = (cartToken) => {
  const headers = {
    "Content-Type": "application/json",
  };

  const wcSession = getWcSession(cartToken);
  if (wcSession) {
    headers["Cart-Token"] = wcSession;
  }

  return headers;
};

/**
 * Sync local cart items to WooCommerce Store API cart
 * This prepares WooCommerce to calculate accurate shipping rates
 */
const syncCartToWooCommerce = async (cartToken, cartItems) => {
  try {
    const headers = buildStoreApiHeaders(cartToken);

    // First, clear any existing items in the WC session cart
    try {
      const cartResponse = await storeApi.get("/cart", { headers });
      saveWcSession(cartToken, cartResponse);

      // Remove existing items
      const existingItems = cartResponse.data.items || [];
      for (const item of existingItems) {
        try {
          await storeApi.post(
            "/cart/remove-item",
            { key: item.key },
            { headers: buildStoreApiHeaders(cartToken) }
          );
        } catch (e) {
          // Ignore removal errors
        }
      }
    } catch (e) {
      // Cart doesn't exist yet, that's fine
    }

    // Add each local cart item to WooCommerce cart
    for (const item of cartItems) {
      try {
        // For WooCommerce Store API:
        // - Simple products: use productId as id
        // - Variable products: use variationId as id (the variation IS the product to add)
        const productIdToAdd = item.variationId || item.productId;

        const addItemPayload = {
          id: productIdToAdd,
          quantity: item.quantity,
        };

        if (process.env.NODE_ENV !== "production") {
          console.log(`[Shipping] Adding to WC cart: id=${productIdToAdd}, qty=${item.quantity}, name=${item.name}`);
        }

        const response = await storeApi.post("/cart/add-item", addItemPayload, {
          headers: buildStoreApiHeaders(cartToken),
        });

        saveWcSession(cartToken, response);
      } catch (error) {
        console.error(`Failed to add item ${item.productId} (variation: ${item.variationId}) to WC cart:`, error.response?.data || error.message);
        // Continue with other items
      }
    }

    return true;
  } catch (error) {
    console.error("Failed to sync cart to WooCommerce:", error.message);
    throw new Error("Failed to sync cart for shipping calculation");
  }
};

/**
 * Calculate shipping rates using WooCommerce Store API
 *
 * This is the core function that:
 * 1. Syncs local cart to WooCommerce
 * 2. Updates customer shipping address
 * 3. Gets WooCommerce's calculated shipping rates (with all plugins applied)
 *
 * @param {Object} address - Shipping address { country, postcode, state, city, address_1 }
 * @param {Array} cartItems - Local cart items to sync
 * @param {string} cartToken - Local cart token for session management
 * @returns {Object} Shipping rates calculated by WooCommerce
 */
export const calculateShippingRates = async (address, cartItems, cartToken) => {
  try {
    const { country, postcode, state, city, address_1 } = address;

    if (!country) {
      throw new Error("Country is required");
    }

    if (!cartItems || cartItems.length === 0) {
      throw new Error("Cart is empty");
    }

    // Step 1: Sync local cart items to WooCommerce
    if (process.env.NODE_ENV !== "production") {
      console.log(`[Shipping] Syncing ${cartItems.length} items to WooCommerce for shipping calculation`);
    }

    await syncCartToWooCommerce(cartToken, cartItems);

    // Step 2: Update customer shipping address via Store API
    // This triggers WooCommerce's shipping calculation including all plugins
    const updateCustomerPayload = {
      shipping_address: {
        country: country,
        state: state || "",
        postcode: postcode || "",
        city: city || "",
        address_1: address_1 || "",
      },
    };

    if (process.env.NODE_ENV !== "production") {
      console.log(`[Shipping] Updating customer address:`, updateCustomerPayload.shipping_address);
    }

    const response = await storeApi.post("/cart/update-customer", updateCustomerPayload, {
      headers: buildStoreApiHeaders(cartToken),
    });

    saveWcSession(cartToken, response);

    // Step 3: Extract shipping rates from WooCommerce response
    const cartData = response.data;
    const shippingRates = cartData.shipping_rates || [];

    if (process.env.NODE_ENV !== "production") {
      console.log(`[Shipping] WooCommerce returned ${shippingRates.length} shipping package(s)`);
    }

    // Step 4: Format rates for frontend
    const formattedMethods = formatShippingRates(shippingRates);

    return {
      zone: null, // WooCommerce handles zones internally
      methods: formattedMethods,
      wcSession: getWcSession(cartToken), // Return session for frontend to store
    };
  } catch (error) {
    console.error("Shipping calculation error:", error.response?.data || error.message);

    // Provide helpful error messages
    if (error.response?.status === 404) {
      throw new Error("WooCommerce Store API not available. Please ensure WooCommerce is up to date.");
    }

    throw new Error(error.message || "Failed to calculate shipping rates");
  }
};

/**
 * Format WooCommerce Store API shipping rates for frontend
 */
const formatShippingRates = (shippingRates) => {
  const methods = [];

  for (const package_ of shippingRates) {
    const packageRates = package_.shipping_rates || [];

    for (const rate of packageRates) {
      methods.push({
        id: rate.rate_id,
        methodId: rate.method_id,
        instanceId: rate.instance_id,
        title: rate.name,
        description: rate.meta_data?.find(m => m.key === "description")?.value || "",
        cost: formatPrice(rate.price),
        currencyCode: rate.currency_code,
        currencySymbol: rate.currency_symbol,
        taxable: rate.taxes && Object.keys(rate.taxes).length > 0,
        selected: rate.selected || false,
        // Include delivery time if available from meta
        deliveryTime: rate.meta_data?.find(m => m.key === "delivery_time")?.value || null,
      });
    }
  }

  return methods;
};

/**
 * Format price from minor units (cents) to major units (pounds)
 * WooCommerce Store API returns prices in minor units
 */
const formatPrice = (priceInMinorUnits) => {
  const price = parseInt(priceInMinorUnits, 10) || 0;
  return (price / 100).toFixed(2);
};

/**
 * Get available shipping countries from WooCommerce settings
 * Uses the legacy WC REST API since this is configuration data
 */
export const getShippingCountries = async () => {
  try {
    const cached = await redis.get("shipping:countries");
    if (cached) {
      return JSON.parse(cached);
    }

    // Use legacy REST API for settings (requires authentication)
    const { data: settings } = await axios.get(
      `${WC_SITE_URL}/wp-json/wc/v3/settings/general`,
      {
        auth: {
          username: WC_CONSUMER_KEY,
          password: WC_CONSUMER_SECRET,
        },
      }
    );

    // Find shipping locations settings
    const shippingCountries = settings.find(
      (s) => s.id === "woocommerce_specific_allowed_countries"
    );
    const allowedCountries = settings.find(
      (s) => s.id === "woocommerce_allowed_countries"
    );

    let countries = [];

    if (allowedCountries?.value === "specific" && shippingCountries?.value) {
      countries = shippingCountries.value;
    } else {
      // Get all countries if all are allowed
      const { data: allCountries } = await axios.get(
        `${WC_SITE_URL}/wp-json/wc/v3/data/countries`,
        {
          auth: {
            username: WC_CONSUMER_KEY,
            password: WC_CONSUMER_SECRET,
          },
        }
      );
      countries = allCountries.map((c) => ({
        code: c.code,
        name: c.name,
      }));
    }

    // Cache the result (24 hours)
    await redis.setex("shipping:countries", 86400, JSON.stringify(countries));

    return countries;
  } catch (error) {
    console.error("Failed to fetch shipping countries:", error.message);
    // Return default UK if error
    return [{ code: "GB", name: "United Kingdom" }];
  }
};

/**
 * Get shipping zones (optional - for admin/debugging)
 * Uses legacy REST API
 */
export const getShippingZones = async () => {
  try {
    const cached = await redis.get("shipping:zones");
    if (cached) {
      return JSON.parse(cached);
    }

    const { data: zones } = await axios.get(
      `${WC_SITE_URL}/wp-json/wc/v3/shipping/zones`,
      {
        auth: {
          username: WC_CONSUMER_KEY,
          password: WC_CONSUMER_SECRET,
        },
      }
    );

    await redis.setex("shipping:zones", SHIPPING_CACHE_TTL, JSON.stringify(zones));

    return zones;
  } catch (error) {
    console.error("Failed to fetch shipping zones:", error.message);
    throw new Error("Failed to fetch shipping zones");
  }
};

/**
 * Clear shipping cache
 */
export const clearShippingCache = async () => {
  try {
    const keys = await redis.keys("shipping:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    // Also clear session storage
    sessionStorage.clear();

    return true;
  } catch (error) {
    console.error("Failed to clear shipping cache:", error.message);
    return false;
  }
};

/**
 * Select a shipping method in WooCommerce
 * Call this when user selects a shipping method
 */
export const selectShippingMethod = async (cartToken, rateId) => {
  try {
    const response = await storeApi.post(
      "/cart/select-shipping-rate",
      {
        package_id: 0, // Usually 0 for single-package orders
        rate_id: rateId,
      },
      {
        headers: buildStoreApiHeaders(cartToken),
      }
    );

    saveWcSession(cartToken, response);

    return {
      success: true,
      cart: response.data,
    };
  } catch (error) {
    console.error("Failed to select shipping method:", error.response?.data || error.message);
    throw new Error("Failed to select shipping method");
  }
};

// ============================================================================
// CUSTOM ENDPOINT APPROACH (Alternative to Store API)
// Uses the custom as-shipping/v1/calculate endpoint for direct package-based calculation
// ============================================================================

/**
 * Custom Shipping API Client
 * Calls the custom WooCommerce REST endpoint that programmatically calculates shipping
 */
const customShippingApi = axios.create({
  baseURL: `${WC_SITE_URL}/wp-json/as-shipping/v1`,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    "X-AS-Shipping-Key": AS_SHIPPING_API_KEY,
  },
});

/**
 * Generate cache key for shipping calculation
 * @param {Array} items - Cart items
 * @param {Object} destination - Shipping destination
 * @returns {string} Cache key
 */
const generateShippingCacheKey = (items, destination) => {
  const payload = JSON.stringify({ items, destination });
  const hash = crypto.createHash("md5").update(payload).digest("hex");
  return `shipping:rates:${hash}`;
};

/**
 * Map internal cart format to WooCommerce API format
 * @param {Array} cartItems - Internal cart items
 * @returns {Array} WooCommerce-formatted items
 */
const mapCartToWcFormat = (cartItems) => {
  return cartItems.map((item) => ({
    product_id: item.productId || item.product_id,
    variation_id: item.variationId || item.variation_id || 0,
    quantity: item.quantity,
  }));
};

/**
 * Calculate shipping rates using custom WooCommerce endpoint
 * This approach directly calls WC_Shipping::calculate_shipping() with a programmatic package
 *
 * @param {Array} items - Cart items in internal format
 * @param {Object} destination - Shipping destination { country, postcode, state, city }
 * @param {Object} options - Optional settings { customerId, coupons, useCache }
 * @returns {Promise<Object>} Shipping rates and package info
 */
export const calculateShippingViaCustomEndpoint = async (items, destination, options = {}) => {
  const { customerId = null, coupons = [], useCache = true } = options;

  if (!AS_SHIPPING_API_KEY) {
    throw new Error("AS_SHIPPING_API_KEY environment variable is not configured");
  }

  if (!items || items.length === 0) {
    throw new Error("Cart is empty");
  }

  if (!destination?.country) {
    throw new Error("Destination country is required");
  }

  // Map to WooCommerce format
  const wcItems = mapCartToWcFormat(items);

  // Check cache if enabled
  if (useCache) {
    const cacheKey = generateShippingCacheKey(wcItems, destination);
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        if (process.env.NODE_ENV !== "production") {
          console.log("[Shipping] Returning cached rates");
        }
        return JSON.parse(cached);
      }
    } catch (e) {
      // Cache miss or error, continue to API call
    }
  }

  try {
    if (process.env.NODE_ENV !== "production") {
      console.log("[Shipping] Calling custom endpoint with", wcItems.length, "items");
    }

    const requestPayload = {
      items: wcItems,
      destination: {
        country: destination.country,
        state: destination.state || "",
        postcode: destination.postcode || "",
        city: destination.city || "",
      },
      customer_id: customerId,
      coupons,
    };

    console.log("[Shipping] Custom endpoint request:", JSON.stringify(requestPayload, null, 2));

    const response = await customShippingApi.post("/calculate", requestPayload);

    console.log("[Shipping] Custom endpoint response:", JSON.stringify(response.data, null, 2));

    const { success, rates, package_info, error } = response.data;

    if (!success) {
      throw new Error(error || "Shipping calculation failed");
    }

    // Format rates for frontend
    const formattedRates = rates.map((rate) => ({
      id: rate.id,
      methodId: rate.method_id,
      instanceId: rate.instance_id,
      title: rate.label,
      cost: rate.cost,
      taxes: rate.taxes,
      metaData: rate.meta_data,
    }));

    const result = {
      methods: formattedRates,
      packageInfo: {
        totalWeight: package_info.total_weight,
        contentsCost: package_info.contents_cost,
        itemCount: package_info.item_count,
        destination: package_info.destination,
      },
    };

    // Cache the result
    if (useCache) {
      const cacheKey = generateShippingCacheKey(wcItems, destination);
      try {
        await redis.setex(cacheKey, SHIPPING_RATES_CACHE_TTL, JSON.stringify(result));
      } catch (e) {
        // Cache write error, ignore
      }
    }

    return result;
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error("Invalid shipping API key");
    }
    if (error.response?.status === 400) {
      throw new Error(error.response.data?.error || "Invalid shipping request");
    }
    if (error.code === "ECONNABORTED") {
      throw new Error("Shipping calculation timed out");
    }

    console.error("[Shipping] Custom endpoint error:", error.response?.data || error.message);
    throw new Error(error.response?.data?.error || "Failed to calculate shipping rates");
  }
};

/**
 * Calculate shipping with fallback
 * Tries custom endpoint first, falls back to Store API if custom endpoint fails
 *
 * @param {Object} address - Shipping address
 * @param {Array} cartItems - Cart items
 * @param {string} cartToken - Cart session token
 * @returns {Promise<Object>} Shipping rates
 */
export const calculateShippingWithFallback = async (address, cartItems, cartToken) => {
  console.log("[Shipping] calculateShippingWithFallback called with:");
  console.log("[Shipping] - Address:", JSON.stringify(address));
  console.log("[Shipping] - Cart items:", JSON.stringify(cartItems, null, 2));
  console.log("[Shipping] - Cart token:", cartToken);

  // Try custom endpoint first (faster, no session management needed)
  if (AS_SHIPPING_API_KEY) {
    try {
      const result = await calculateShippingViaCustomEndpoint(cartItems, address);
      console.log("[Shipping] Custom endpoint returned", result.methods.length, "methods:");
      result.methods.forEach(m => console.log(`[Shipping]   - ${m.title}: £${m.cost}`));
      return {
        zone: null,
        methods: result.methods,
        packageInfo: result.packageInfo,
      };
    } catch (error) {
      console.warn("[Shipping] Custom endpoint failed, falling back to Store API:", error.message);
    }
  }

  // Fallback to Store API approach
  return calculateShippingRates(address, cartItems, cartToken);
};
