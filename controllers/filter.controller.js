import { getFilteredProducts, getFilterOptions } from "../services/filter.service.js";
import { buildMeta } from "../utils/transform.js";

export async function filterProductsController(req, res) {
  try {
    const filters = {
      ...req.query,
      page: Number(req.query.page || 1),
      per_page: Number(req.query.per_page || 12),
    };

    const { products, totalProducts, totalPages, page, per_page } = await getFilteredProducts(filters);

    // Build meta in the same format as other endpoints
    const meta = buildMeta({
      page,
      per_page,
      totalPages,
      totalProducts
    });

    res.json({
      success: true,
      products,
      meta,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch filtered products",
    });
  }
}

export async function filterOptionsController(req, res) {
  try {
    const data = await getFilterOptions();
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch filter options",
    });
  }
}

