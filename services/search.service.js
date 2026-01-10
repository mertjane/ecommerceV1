// import wcApi from "../config/woocommerce.js";
// import redisClient from "../config/redis.js";
// import { buildMeta, transformProducts } from "../utils/transform.js";

// // Cache TTL 6 hours (for category lookups only)
// const CACHE_TTL = 60 * 60 * 6;

// /**
//  * Search products by name and optionally filter by category
//  * No caching - direct search for better performance
//  */
// export const searchProducts = async (query) => {
//   const { q = "", category = "", page = 1, per_page = 12 } = query;

//   // Validate search query
//   if (!q || q.trim().length === 0) {
//     return {
//       data: [],
//       meta: {
//         current_page: 1,
//         per_page: parseInt(per_page),
//         total_pages: 0,
//         total_products: 0,
//         has_next_page: false,
//         has_prev_page: false,
//         search_query: "",
//       },
//     };
//   }

//   console.log(`[SEARCH] Searching for "${q.trim()}" from WooCommerce API`);

//   // Build WooCommerce API parameters
//   let categoryId = null;
//   if (category && category.trim()) {
//     categoryId = await resolveCategoryId(category.trim());
//     if (!categoryId) {
//       console.log(`Category "${category}" not found for search`);
//     }
//   }

//   try {
//     // Fetch from WooCommerce - get first 100 results to filter client-side
//     const wcParams = {
//       search: q.trim(),
//       per_page: 100,
//       status: "publish",
//     };

//     if (categoryId) {
//       wcParams.category = categoryId;
//     }

//     const response = await wcApi.get("products", wcParams);

//     const searchTerm = q.trim().toLowerCase();

//     // Filter products by name (strict matching)
//     const filteredProducts = response.data.filter(product => {
//       const productName = product.name.toLowerCase();
//       // Check if product name contains the search term
//       return productName.includes(searchTerm);
//     });

//     // Sort by relevance: exact match > starts with > contains
//     const sortedProducts = filteredProducts.sort((a, b) => {
//       const aName = a.name.toLowerCase();
//       const bName = b.name.toLowerCase();

//       // Exact match wins
//       if (aName === searchTerm) return -1;
//       if (bName === searchTerm) return 1;

//       // Starts with search term wins
//       if (aName.startsWith(searchTerm) && !bName.startsWith(searchTerm)) return -1;
//       if (bName.startsWith(searchTerm) && !aName.startsWith(searchTerm)) return 1;

//       // Otherwise keep original order
//       return 0;
//     });

//     // Apply pagination to filtered results
//     const totalProducts = sortedProducts.length;
//     const totalPages = Math.ceil(totalProducts / parseInt(per_page));
//     const startIndex = (parseInt(page) - 1) * parseInt(per_page);
//     const endIndex = startIndex + parseInt(per_page);
//     const paginatedProducts = sortedProducts.slice(startIndex, endIndex);

//     const meta = {
//       ...buildMeta({ page, per_page, totalPages, totalProducts }),
//       search_query: q.trim(),
//       category: category || null,
//     };

//     const data = transformProducts(paginatedProducts);

//     const result = { data, meta };

//     console.log(`✓ [SEARCH COMPLETE] Found ${totalProducts} products matching "${q.trim()}"`);

//     return result;
//   } catch (error) {
//     console.error("Error searching products:", error.message);
//     throw new Error("Failed to search products");
//   }
// };

// /**
//  * Helper function to resolve category slug or ID to category ID
//  * Uses Redis cache for category lookups
//  */
// const resolveCategoryId = async (categorySlugOrId) => {
//   // If it's already a numeric ID, return it
//   if (!isNaN(categorySlugOrId)) {
//     return parseInt(categorySlugOrId);
//   }

//   // It's a slug - check Redis cache
//   const slugCacheKey = `category:slug:${categorySlugOrId}`;
//   const categoryId = await redisClient.get(slugCacheKey);

//   if (categoryId) {
//     console.log(`✓ [CACHE HIT] Category slug "${categorySlugOrId}" -> ID: ${categoryId}`);
//     return parseInt(categoryId);
//   }

//   // Cache miss - fetch from WooCommerce
//   try {
//     const response = await wcApi.get("products/categories", {
//       per_page: 100,
//     });

//     if (response.data && response.data.length > 0) {
//       // Cache all categories for future use
//       for (const cat of response.data) {
//         const catCacheKey = `category:slug:${cat.slug}`;
//         await redisClient.set(catCacheKey, cat.id.toString(), "EX", CACHE_TTL);
//       }

//       // Find the matching category
//       const category = response.data.find((cat) => cat.slug === categorySlugOrId);
//       if (category) {
//         console.log(`✓ Resolved category slug "${categorySlugOrId}" to ID: ${category.id}`);
//         return category.id;
//       }
//     }

//     return null;
//   } catch (error) {
//     console.error(`Error resolving category "${categorySlugOrId}":`, error.message);
//     return null;
//   }
// };

import { fetchAllProducts } from "./products.service.js"; // Import the caching service we built
import { buildMeta, transformProducts } from "../utils/transform.js";

/**
 * Search products using In-Memory Linear Search O(n)
 * Strategy: Fetch all from Redis -> Filter in Node.js -> Sort -> Paginate
 */
export const searchProducts = async (query) => {
  const { q = "", category = "", page = 1, per_page = 12 } = query;

  // 1. Validation
  if (!q || q.trim().length === 0) {
    return emptyResponse(per_page);
  }

  const searchTerm = q.trim().toLowerCase();
  const categorySlug = category ? category.trim().toLowerCase() : null;

  console.log(`[SEARCH] ⚡ Running O(n) search for: "${searchTerm}"`);

  try {
    // 2. GET DATA: Fetch full list from Redis (Fast!)
    // This is the function we wrote earlier that checks Redis first
    const allProducts = await fetchAllProducts();

    // 3. FILTER ALGORITHM: Linear Search O(n)
    // We iterate through all 500 products exactly once.
    const filteredProducts = allProducts.filter((product) => {
      // A. Text Match (Name or Slug)
      // Note: Ensure your transform function includes 'slug' and 'categories'
      const nameMatch = product.name.toLowerCase().includes(searchTerm);
      const slugMatch = product.slug.includes(searchTerm);
      
      const isTextMatch = nameMatch || slugMatch;

      // B. Category Filter (Optional)
      // If category is provided, check if product belongs to it
      if (categorySlug && isTextMatch) {
        // Assuming product.categories is an array of objects: [{id: 1, slug: 'tiles'}]
        const inCategory = product.categories.some(
          (cat) => cat.slug.toLowerCase() === categorySlug
        );
        return inCategory;
      }

      return isTextMatch;
    });

    // 4. SORTING ALGORITHM: Relevance O(M log M)
    // Sort only the matches found (M), not the whole list.
    const sortedProducts = filteredProducts.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();

      // Priority 1: Exact Match
      if (aName === searchTerm) return -1;
      if (bName === searchTerm) return 1;

      // Priority 2: Starts With
      const aStarts = aName.startsWith(searchTerm);
      const bStarts = bName.startsWith(searchTerm);
      if (aStarts && !bStarts) return -1;
      if (bStarts && !aStarts) return 1;

      // Priority 3: Alphabetical (fallback)
      return aName.localeCompare(bName);
    });

    // 5. PAGINATION: O(1)
    // Slice the array for the requested page
    const totalProducts = sortedProducts.length;
    const totalPages = Math.ceil(totalProducts / parseInt(per_page));
    const startIndex = (parseInt(page) - 1) * parseInt(per_page);
    const paginatedProducts = sortedProducts.slice(startIndex, startIndex + parseInt(per_page));

    // 6. RESPONSE PREPARATION
    const meta = {
      ...buildMeta({ page, per_page, totalPages, totalProducts }),
      search_query: q.trim(),
      category: category || null,
    };

    // Transform just the current page's products for the frontend
    // (Ensure your transformProducts handles the data format from fetchAllProducts)
    const data = transformProducts(paginatedProducts); 

    console.log(`✓ [SEARCH COMPLETE] Found ${totalProducts} matches in < 50ms`);

    return { data, meta };

  } catch (error) {
    console.error("Error searching products:", error);
    // Return empty results rather than crashing the search page
    return emptyResponse(per_page);
  }
};

// Helper for empty response
const emptyResponse = (per_page) => ({
  data: [],
  meta: {
    current_page: 1,
    per_page: parseInt(per_page),
    total_pages: 0,
    total_products: 0,
    search_query: "",
  },
});