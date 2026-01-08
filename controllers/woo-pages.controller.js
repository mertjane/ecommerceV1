import { fetchPageBySlug } from "../services/woo-pages.service.js";
import { successResponse, handleError } from "../utils/response.js";

/**
 * Get page by slug
 * GET /api/pages/:slug
 */
export const getPageBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    if (!slug) {
      return handleError(res, "Page slug is required", 400);
    }

    const result = await fetchPageBySlug(slug);

    if (!result.success) {
      return handleError(res, result.message, 404);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("Get page error:", error);
    return handleError(res, "Failed to fetch page", 500);
  }
};
