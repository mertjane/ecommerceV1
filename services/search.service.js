import wcApi from "../config/woocommerce.js";
import redisClient from "../config/redis.js";
import { buildMeta, transformProducts } from "../utils/transform.js";

// Cache TTL 6 hours
const CACHE_TTL = 60 * 60 * 6;

// Generate cache key for search queries
const getSearchCacheKey = (query) => {
  const { q = "", category = "", page = 1, per_page = 12 } = query;
  return `search:q=${q}:category=${category}:page=${page}:per_page=${per_page}`;
};

/**
 * Search products by name and optionally filter by category
 * Uses Redis cache for fast responses
 */
export const searchProducts = async (query) => {
  const { q = "", category = "", page = 1, per_page = 12 } = query;

  // Validate search query
  if (!q || q.trim().length === 0) {
    return {
      data: [],
      meta: {
        current_page: 1,
        per_page: parseInt(per_page),
        total_pages: 0,
        total_products: 0,
        has_next_page: false,
        has_prev_page: false,
        search_query: "",
      },
    };
  }

  const cacheKey = getSearchCacheKey({ q, category, page, per_page });

  // Check Redis cache first
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    console.log("✓ [CACHE HIT] Serving search results from Redis:", cacheKey);
    return JSON.parse(cached);
  }

  console.log("✗ [CACHE MISS] Fetching search results from WooCommerce API:", cacheKey);

  // Build WooCommerce API parameters
  const params = {
    search: q.trim(),
    page: parseInt(page),
    per_page: parseInt(per_page),
    status: "publish",
    orderby: "relevance", // Search relevance ordering
  };

  // If category is provided, resolve it and add to params
  if (category && category.trim()) {
    const categoryId = await resolveCategoryId(category.trim());
    if (categoryId) {
      params.category = categoryId;
    } else {
      console.log(`Category "${category}" not found for search`);
    }
  }

  try {
    // Fetch from WooCommerce
    const response = await wcApi.get("products", { params });

    const totalPages = parseInt(response.headers["x-wp-totalpages"]) || 0;
    const totalProducts = parseInt(response.headers["x-wp-total"]) || 0;

    const meta = {
      ...buildMeta({ page, per_page, totalPages, totalProducts }),
      search_query: q.trim(),
      category: category || null,
    };

    const data = transformProducts(response.data);

    const result = { data, meta };

    // Cache the search results
    await redisClient.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL);
    console.log(`✓ [CACHED] Search results saved to Redis (TTL: ${CACHE_TTL}s):`, cacheKey);

    return result;
  } catch (error) {
    console.error("Error searching products:", error.message);
    throw new Error("Failed to search products");
  }
};

/**
 * Get search suggestions based on product names
 * Returns quick suggestions with relevance sorting
 */
export const getSearchSuggestions = async (query) => {
  const { q = "", limit = 10 } = query;

  if (!q || q.trim().length < 2) {
    return { products: [], categories: [] };
  }

  const cacheKey = `search:suggestions:q=${q.trim()}:limit=${limit}`;

  // Check cache
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    console.log("✓ [CACHE HIT] Serving suggestions from Redis:", cacheKey);
    return JSON.parse(cached);
  }

  console.log("✗ [CACHE MISS] Fetching suggestions from WooCommerce API:", cacheKey);

  try {
    // Fetch products matching the search term
    const response = await wcApi.get("products", {
      params: {
        search: q.trim(),
        per_page: parseInt(limit),
        status: "publish",
        orderby: "relevance",
      },
    });

    const searchTerm = q.trim().toLowerCase();

    // Sort by relevance: exact match > starts with > contains
    const sortedProducts = response.data
      .filter(product => product.name.toLowerCase().includes(searchTerm))
      .sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();

        // Exact match wins
        if (aName === searchTerm) return -1;
        if (bName === searchTerm) return 1;

        // Starts with search term wins
        if (aName.startsWith(searchTerm) && !bName.startsWith(searchTerm)) return -1;
        if (bName.startsWith(searchTerm) && !aName.startsWith(searchTerm)) return 1;

        // Otherwise keep original order
        return 0;
      })
      .slice(0, 5)
      .map((product) => ({
        id: product.id,
        name: product.name,
        slug: product.slug,
        image: product.images?.[0]?.src || null,
        price_html: product.price_html,
      }));

    // Also fetch matching categories
    const categoriesResponse = await wcApi.get("products/categories", {
      search: q.trim(),
      per_page: 3,
    });

    const suggestions = {
      products: sortedProducts,
      categories: categoriesResponse.data.map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        count: cat.count,
      })),
    };

    // Cache suggestions for shorter time (30 minutes)
    await redisClient.set(cacheKey, JSON.stringify(suggestions), "EX", 1800);
    console.log("✓ [CACHED] Suggestions saved to Redis");

    return suggestions;
  } catch (error) {
    console.error("Error fetching search suggestions:", error.message);
    throw new Error("Failed to fetch search suggestions");
  }
};

/**
 * Helper function to resolve category slug or ID to category ID
 * Uses Redis cache for category lookups
 */
const resolveCategoryId = async (categorySlugOrId) => {
  // If it's already a numeric ID, return it
  if (!isNaN(categorySlugOrId)) {
    return parseInt(categorySlugOrId);
  }

  // It's a slug - check Redis cache
  const slugCacheKey = `category:slug:${categorySlugOrId}`;
  const categoryId = await redisClient.get(slugCacheKey);

  if (categoryId) {
    console.log(`✓ [CACHE HIT] Category slug "${categorySlugOrId}" -> ID: ${categoryId}`);
    return parseInt(categoryId);
  }

  // Cache miss - fetch from WooCommerce
  try {
    const response = await wcApi.get("products/categories", {
      per_page: 100,
    });

    if (response.data && response.data.length > 0) {
      // Cache all categories for future use
      for (const cat of response.data) {
        const catCacheKey = `category:slug:${cat.slug}`;
        await redisClient.set(catCacheKey, cat.id.toString(), "EX", CACHE_TTL);
      }

      // Find the matching category
      const category = response.data.find((cat) => cat.slug === categorySlugOrId);
      if (category) {
        console.log(`✓ Resolved category slug "${categorySlugOrId}" to ID: ${category.id}`);
        return category.id;
      }
    }

    return null;
  } catch (error) {
    console.error(`Error resolving category "${categorySlugOrId}":`, error.message);
    return null;
  }
};