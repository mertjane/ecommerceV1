import { fetchProductsByCategory, fetchCategoryBySlug, fetchAllCategories } from "../services/products.service.js";
import { buildMeta } from "../utils/transform.js";

/**
 * Controller: Get All Categories
 * Route: GET /api/products/categories
 */
export async function getCategories(req, res) {
  try {
    const categories = await fetchAllCategories();
    
    // Safety: use optional chaining (?.) just in case
    categories.sort((a, b) => {
      const nameA = a?.name || ""; // Fallback to empty string if missing
      const nameB = b?.name || "";
      return nameA.localeCompare(nameB);
    });

    return res.json({
      count: categories.length,
      categories
    });
  } catch (error) {
    console.error("Error in getCategories:", error);
    return res.status(500).json({ message: "Server error fetching categories" });
  }
}

export async function getCategoryProducts(req, res) {
  try {
    const { slug } = req.params;

    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 12;

    // Extract filters from query (exclude page & per_page)
    const { page: _, per_page: __, } = req.query;

    // Fetch category info from WooCommerce
    const category = await fetchCategoryBySlug(slug);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Fetch products in category
    const { products, totalProducts, totalPages } = await fetchProductsByCategory({
      categoryId: category.id,
      page,
      perPage,
    });

    // metabuilder
    const meta = buildMeta({
      page,
      per_page: perPage,
      totalPages,
      totalProducts
    });

    return res.json({
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
      },
      products,
      meta,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
}
