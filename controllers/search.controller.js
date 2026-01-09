import { searchProducts } from "../services/search.service.js";
import { successResponse, handleError } from "../utils/response.js";

/**
 * Controller for searching products
 * GET /api/search?q=marble&category=tiles&page=1&per_page=12
 */
export const searchProductsController = async (req, res) => {
  try {
    const { q, category, page, per_page } = req.query;

    // Validate search query
    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        error: "Search query is required",
        message: "Please provide a search query using the 'q' parameter",
      });
    }

    const { data, meta } = await searchProducts({
      q,
      category,
      page,
      per_page,
    });

    return successResponse(
      res,
      data,
      `Found ${meta.total_products} products matching "${q}"`,
      meta
    );
  } catch (error) {
    console.error("Error in searchProductsController:", error);
    return handleError(res, error, "Failed to search products");
  }
};


