import redisClient from "../config/redis.js";
import { normalizeMenu } from "../utils/normalizeMenu.js";

// Cache TTL: 1 hour (matches product cache refresh frequency)
const CACHE_TTL = 60 * 60; // 1 hour in seconds
const CACHE_KEY = "wp:menu:primary";

/**
 * Fetch megamenu from WordPress
 */
const fetchMenuFromWordPress = async () => {
  const wpUrl = process.env.WC_SITE_URL;

  const response = await fetch(`${wpUrl}/wp-json/custom/v1/megamenu`);

  if (!response.ok) {
    throw new Error(`WordPress API error: ${response.status}`);
  }

  const data = await response.json();
  return normalizeMenu(data);
};

/**
 * Get megamenu with Redis caching
 * @param {boolean} forceRefresh - Force fetch from WordPress
 */
export const fetchMenu = async (forceRefresh = false) => {
  try {
    // 1. Check cache unless forcing refresh
    if (!forceRefresh) {
      const cached = await redisClient.get(CACHE_KEY);
      if (cached) {
        console.log("[CACHE HIT] Serving megamenu from Redis");
        return {
          source: "cache",
          data: JSON.parse(cached),
        };
      }
    }

    // 2. Fetch from WordPress
    console.log("[CACHE MISS] Fetching megamenu from WordPress API");
    const menuData = await fetchMenuFromWordPress();

    // 3. Cache the result
    await redisClient.set(CACHE_KEY, JSON.stringify(menuData), "EX", CACHE_TTL);
    console.log(`[CACHED] Megamenu saved to Redis (TTL: ${CACHE_TTL}s)`);

    return {
      source: "origin",
      data: menuData,
    };
  } catch (error) {
    console.error("Menu service error:", error.message);
    throw error;
  }
};

/**
 * Warm up menu cache on server start
 * @param {boolean} forceRefresh - Force fetch from WordPress
 */
export const cacheMenuOnStart = async (forceRefresh = false) => {
  try {
    // Check if already cached and not forcing refresh
    if (!forceRefresh) {
      const cached = await redisClient.get(CACHE_KEY);
      if (cached) {
        console.log("Megamenu already in cache. Skipping warmup.");
        return;
      }
    }

    console.log("[CACHE WARMING] Fetching megamenu...");
    await fetchMenu(true);
    console.log("[CACHE WARMING] Megamenu cache ready!");
  } catch (error) {
    console.error("[CACHE WARMING] Failed to warm up megamenu cache:", error.message);
  }
};
