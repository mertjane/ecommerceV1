import redisClient from "../config/redis.js";
import { fetchFilteredProducts, fetchFilterOptions as fetchFilterOptionsFromWP} from "../integrations/wordpress/filter.wp.js";
import { transformProducts } from "../utils/transform.js";

const CACHE_TTL = 60 * 60 * 24; // 24 hours
const FILTER_OPTIONS_KEY = "filter:options";

export async function getFilteredProducts(filters) {
  const wpResponse = await fetchFilteredProducts(filters);

  return {
    products: transformProducts(wpResponse.products),
    totalProducts: wpResponse.total,
    totalPages: wpResponse.pages,
    page: wpResponse.page,
    per_page: wpResponse.per_page,
  };
}

export async function getFilterOptions() {
  // 1. Try to get data from Redis first
  try {
    const cachedData = await redisClient.get(FILTER_OPTIONS_KEY);
    if (cachedData) {
      return JSON.parse(cachedData);
    }
  } catch (err) {
    console.error("Redis get error:", err);
  }

  // 2. If not in cache (or error), fetch from WordPress API
  // console.log("Cache miss. Fetching from WP...");
  const data = await fetchFilterOptionsFromWP();

  // 3. Save to Redis for next time
  if (data) {
    try {
      await redisClient.set(FILTER_OPTIONS_KEY, JSON.stringify(data), "EX", CACHE_TTL);
    } catch (err) {
      console.error("Redis set error:", err);
    }
  }

  return data;
}

/**
 * Cache filter options on server start
 * Automatically warms up the cache
 */
export async function cacheFilterOptionsOnStart() {
  try {
    console.log("Warming up Filter Options Cache...");
    
    // We simply call the function we wrote above.
    // Since cache is empty (due to flushall), this will fetch from API and save to Redis.
    await getFilterOptions();
    
    console.log("Filter Options Cache Warmup Complete!");
  } catch (error) {
    console.error("Failed to warm up Filter Options cache:", error.message);
  }
}