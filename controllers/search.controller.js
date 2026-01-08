import { searchProducts, getSearchSuggestions } from "../services/search.service.js";
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

/**
 * Controller for getting search suggestions (autocomplete)
 * GET /api/search/suggestions?q=mar&limit=5
 */
export const getSearchSuggestionsController = async (req, res) => {
  try {
    const { q, limit } = req.query;

    // Validate search query
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        error: "Search query too short",
        message: "Please provide at least 2 characters for suggestions",
      });
    }

    const suggestions = await getSearchSuggestions({ q, limit });

    return successResponse(
      res,
      suggestions,
      "Search suggestions retrieved successfully"
    );
  } catch (error) {
    console.error("Error in getSearchSuggestionsController:", error);
    return handleError(res, error, "Failed to fetch search suggestions");
  }
};
