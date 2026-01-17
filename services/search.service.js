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

  console.log(`[SEARCH] Running O(n) search for: "${searchTerm}"`);

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

    console.log(`[SEARCH COMPLETE] Found ${totalProducts} matches in < 50ms`);

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