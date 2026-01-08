import { successResponse, handleError } from "../utils/response.js";
import { fetchProductVariation, fetchProductVariations } from "../services/variations.service.js";

/**
 * Get a single product variation
 */
export const getProductVariation = async (req, res) => {
  try {
    const { productId, variationId } = req.params;

    const variation = await fetchProductVariation(productId, variationId);

    successResponse(res, variation, "Product variation fetched successfully");
  } catch (error) {
    if (error.response?.status === 404) {
      res.status(404).json({
        success: false,
        message: "Product variation not found",
      });
    } else {
      handleError(res, error, "Failed to fetch product variation");
    }
  }
};

/**
 * Get all variations for a product
 */
export const getProductVariations = async (req, res) => {
  try {
    const { productId } = req.params;

    const variations = await fetchProductVariations(productId);

    successResponse(res, variations, "Product variations fetched successfully");
  } catch (error) {
    if (error.response?.status === 404) {
      res.status(404).json({
        success: false,
        message: "Product not found",
      });
    } else {
      handleError(res, error, "Failed to fetch product variations");
    }
  }
};
