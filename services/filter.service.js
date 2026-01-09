import { fetchFilteredProducts, fetchFilterOptions } from "../integrations/wordpress/filter.wp.js";
import { transformProducts } from "../utils/transform.js";

export async function getFilteredProducts(filters) {
  const wpResponse = await fetchFilteredProducts(filters);

  return {
    products: transformProducts(wpResponse.products),
    totalProducts: wpResponse.total,
    totalPages: wpResponse.pages,
    page: wpResponse.page,
    per_page: wpResponse.per_page,
  };
}

export async function getFilterOptions() {
  const data = await fetchFilterOptions();
  return data;
}
