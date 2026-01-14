import redisClient from "../config/redis.js";
import { fetchAllProducts } from "./products.service.js"; // ⚡ FAST: Use the Cache!
import { fetchFilterOptions as fetchFilterOptionsFromWP } from "../integrations/wordpress/filter.wp.js"; // Keep this for sidebar options only

const CACHE_TTL = 60 * 60 * 24; // 24 hours
const FILTER_OPTIONS_KEY = "filter:options";

// Allowed attribute slugs (security whitelist)
const ALLOWED_FILTERS = ["pa_material", "pa_room-type-usage", "pa_colour", "pa_finish"];

/**
 * Get Filtered Products (In-Memory Implementation)
 * Replaces the slow WP API call with O(n) Linear Search
 */
export async function getFilteredProducts(queryFilters) {
  // 1. Load all 500 products from Redis/RAM
  const allProducts = await fetchAllProducts();

  // 2. Extract special params, leave the rest as attribute filters
  const { 
    page = 1, 
    per_page = 12, 
    orderby = 'date', 
    order = 'desc', 
    ...attributes 
  } = queryFilters;

  // 3. FILTER LOGIC: Check every product against the filters
  const filteredProducts = allProducts.filter((product) => {
    
    // Iterate through every filter passed in the URL (e.g., pa_colour=black,white)
    return Object.entries(attributes).every(([filterKey, filterValue]) => {
      
      // Ignore params that aren't in our allowed list
      if (!ALLOWED_FILTERS.includes(filterKey)) return true;
      if (!filterValue) return true;

      // --- CRITICAL FIX FOR buildQueryString COMPATIBILITY ---
      // Your frontend sends "black,white" (joined by commas).
      // We must SPLIT it back into an array: ['black', 'white']
      const requestedOptions = filterValue.split(',').map(v => v.trim().toLowerCase());

      // Find the matching attribute group in the product
      const productAttr = product.attributes.find((attr) => attr.slug === filterKey);

      // If product doesn't have this attribute at all, reject it
      if (!productAttr) return false;

      // Check if ANY of the requested options match the product's options
      // productAttr.options example: ["Black", "White"]
      const hasMatch = productAttr.options.some((optionName) => {
        const normalizedName = optionName.toLowerCase();
        
        // 1. Check exact name ("black")
        if (requestedOptions.includes(normalizedName)) return true;

        // 2. Check slugified name ("black-and-white" matches "Black and White")
        const slugifiedName = normalizedName.replace(/\s+/g, '-');
        if (requestedOptions.includes(slugifiedName)) return true;

        return false;
      });

      return hasMatch;
    });
  });

  // 4. SORTING (Since we aren't using WP to sort anymore)
  const sortedProducts = filteredProducts.sort((a, b) => {
    let comparison = 0;
    const getPrice = (p) => parseFloat(p.price || 0);

    switch (orderby) {
      case 'price':
        comparison = getPrice(a) - getPrice(b);
        break;
      case 'title':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'date':
      default:
        const dateA = new Date(a.date_created);
        const dateB = new Date(b.date_created);
        comparison = dateA - dateB;
        break;
    }
    return order === 'asc' ? comparison : comparison * -1;
  });

  // 5. PAGINATION
  const totalProducts = sortedProducts.length;
  const totalPages = Math.ceil(totalProducts / parseInt(per_page));
  const startIndex = (parseInt(page) - 1) * parseInt(per_page);
  const paginatedProducts = sortedProducts.slice(startIndex, startIndex + parseInt(per_page));

  console.log(`[FILTER] ⚡ Served ${paginatedProducts.length} filtered products from Cache.`);

  return {
    products: paginatedProducts, // Already transformed in fetchAllProducts
    totalProducts: totalProducts,
    totalPages: totalPages,
    page: parseInt(page),
    per_page: parseInt(per_page),
  };
}

/**
 * Get Filter Options (Sidebar Facets)
 * @param {boolean} forceRefresh - If true, bypasses Redis and fetches fresh from WP
 */
export async function getFilterOptions(forceRefresh = false) {
  // 1. Try Redis ONLY if we are NOT forcing a refresh
  if (!forceRefresh) {
    try {
      const cachedData = await redisClient.get(FILTER_OPTIONS_KEY);
      if (cachedData) {
        return JSON.parse(cachedData);
      }
    } catch (err) {
      console.error("Redis get error:", err);
    }
  }

  // 2. Fetch fresh from WP (This runs if cache is empty OR forceRefresh is true)
  console.log("Fetching fresh filter options from WordPress...");
  const data = await fetchFilterOptionsFromWP();

  // 3. Save to Redis (Overwrites old data)
  if (data) {
    try {
      await redisClient.set(FILTER_OPTIONS_KEY, JSON.stringify(data), "EX", CACHE_TTL);
      console.log("Filter options cache updated.");
    } catch (err) {
      console.error("Redis set error:", err);
    }
  }

  return data;
}

export async function cacheFilterOptionsOnStart(forceRefresh = false) {
  try {
    console.log("Warming up Filter Options Cache...");
    await getFilterOptions(forceRefresh);
    console.log("Filter Options Cache Warmup Complete!");
  } catch (error) {
    console.error("Failed to warm up Filter Options cache:", error.message);
  }
}