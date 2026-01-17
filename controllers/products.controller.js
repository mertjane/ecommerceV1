import { fetchProductsByCategory, fetchCategoryBySlug, fetchAllCategories, fetchPopularProducts, fetchNewArrivals, fetchProductBySlug } from "../services/products.service.js";
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
    const orderby = req.query.orderby || 'date';
    const order = req.query.order || 'desc';

    // Fetch category info from WooCommerce
    const category = await fetchCategoryBySlug(slug);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Fetch products in category with sorting
    const { products, totalProducts, totalPages } = await fetchProductsByCategory({
      categoryId: category.id,
      page,
      perPage,
      orderby,
      order,
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

/**
 * Controller: Get Popular Products
 * Route: GET /api/products/popular
 */
export async function getPopularProducts(req, res) {
  try {
    const products = await fetchPopularProducts();

    return res.json({
      count: products.length,
      products
    });
  } catch (error) {
    console.error("Error in getPopularProducts:", error);
    return res.status(500).json({ message: "Server error fetching popular products" });
  }
}

/**
 * Controller: Get Single Product by Slug
 * Route: GET /api/products/slug/:slug
 */
export async function getProductBySlug(req, res) {
  try {
    const { slug } = req.params;

    const product = await fetchProductBySlug(slug);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.json({ product });
  } catch (error) {
    console.error("Error in getProductBySlug:", error);
    return res.status(500).json({ message: "Server error fetching product" });
  }
}

/**
 * Controller: Get New Arrivals
 * Route: GET /api/products/new-arrivals
 */
export async function getNewArrivals(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 12;

    const { products, totalProducts, totalPages, per_page } = await fetchNewArrivals(page, perPage);

    // Build meta
    const meta = buildMeta({
      page,
      per_page,
      totalPages,
      totalProducts
    });

    return res.json({
      products,
      meta
    });
  } catch (error) {
    console.error("Error in getNewArrivals:", error);
    return res.status(500).json({ message: "Server error fetching new arrivals" });
  }
}
