import wcApi from "../config/woocommerce.js";
import redisClient from "../config/redis.js";
import { buildMeta, transformProducts } from "../utils/transform.js";

// Cache TTL 6 hours (for category lookups only)
const CACHE_TTL = 60 * 60 * 6;

/**
 * Search products by name and optionally filter by category
 * No caching - direct search for better performance
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

  console.log(`[SEARCH] Searching for "${q.trim()}" from WooCommerce API`);

  // Build WooCommerce API parameters
  let categoryId = null;
  if (category && category.trim()) {
    categoryId = await resolveCategoryId(category.trim());
    if (!categoryId) {
      console.log(`Category "${category}" not found for search`);
    }
  }

  try {
    // Fetch from WooCommerce - get first 100 results to filter client-side
    const wcParams = {
      search: q.trim(),
      per_page: 100,
      status: "publish",
    };

    if (categoryId) {
      wcParams.category = categoryId;
    }

    const response = await wcApi.get("products", wcParams);

    const searchTerm = q.trim().toLowerCase();

    // Filter products by name (strict matching)
    const filteredProducts = response.data.filter(product => {
      const productName = product.name.toLowerCase();
      // Check if product name contains the search term
      return productName.includes(searchTerm);
    });

    // Sort by relevance: exact match > starts with > contains
    const sortedProducts = filteredProducts.sort((a, b) => {
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
    });

    // Apply pagination to filtered results
    const totalProducts = sortedProducts.length;
    const totalPages = Math.ceil(totalProducts / parseInt(per_page));
    const startIndex = (parseInt(page) - 1) * parseInt(per_page);
    const endIndex = startIndex + parseInt(per_page);
    const paginatedProducts = sortedProducts.slice(startIndex, endIndex);

    const meta = {
      ...buildMeta({ page, per_page, totalPages, totalProducts }),
      search_query: q.trim(),
      category: category || null,
    };

    const data = transformProducts(paginatedProducts);

    const result = { data, meta };

    console.log(`✓ [SEARCH COMPLETE] Found ${totalProducts} products matching "${q.trim()}"`);

    return result;
  } catch (error) {
    console.error("Error searching products:", error.message);
    throw new Error("Failed to search products");
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
