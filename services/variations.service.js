import wcApi from "../config/woocommerce.js";
import redisClient from "../config/redis.js";

// Cache TTL 6 hours
const CACHE_TTL = 60 * 60 * 6;

/**
 * Fetch a single product variation
 * @param {number} productId - The product ID
 * @param {number} variationId - The variation ID
 * @returns {Promise<Object>} - The variation data
 */
export const fetchProductVariation = async (productId, variationId) => {
  const cacheKey = `variation:${productId}:${variationId}`;

  // Check Redis cache
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    console.log(`[CACHE HIT] Serving variation from Redis: ${cacheKey}`);
    return JSON.parse(cached);
  }

  console.log(`[CACHE MISS] Fetching variation from WooCommerce API: ${cacheKey}`);

  // Fetch from WooCommerce API
  const response = await wcApi.get(`products/${productId}/variations/${variationId}`);
  const variation = response.data;

  // Cache the result
  await redisClient.set(cacheKey, JSON.stringify(variation), "EX", CACHE_TTL);

  return variation;
};

/**
 * Fetch all variations for a product
 * @param {number} productId - The product ID
 * @returns {Promise<Array>} - Array of variations
 */
export const fetchProductVariations = async (productId) => {
  const cacheKey = `variations:product:${productId}`;

  // Check Redis cache
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    console.log(`[CACHE HIT] Serving variations from Redis: ${cacheKey}`);
    return JSON.parse(cached);
  }

  console.log(`[CACHE MISS] Fetching variations from WooCommerce API: ${cacheKey}`);

  // Fetch from WooCommerce API
  const response = await wcApi.get(`products/${productId}/variations`, {
    per_page: 100, // Get all variations
  });
  const variations = response.data;

  // Cache the result
  await redisClient.set(cacheKey, JSON.stringify(variations), "EX", CACHE_TTL);

  return variations;
};
