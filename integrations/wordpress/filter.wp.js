import { buildQueryString } from "../../utils/buildQueryString.js";
import wcApi from "../../config/woocommerce.js";

const WP_FILTER_ENDPOINT = `${process.env.WC_SITE_URL}/wp-json/custom/v1/products`;

export async function fetchFilteredProducts(filters) {
  const queryString = buildQueryString(filters);
  const url = `${WP_FILTER_ENDPOINT}?${queryString}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WP API error ${response.status}: ${text}`);
  }

  return response.json(); // raw WP response
}



// Attributes slugs you want
const ATTRIBUTES = ["pa_material", "pa_room-type-usage", "pa_colour", "pa_finish"];

export async function fetchFilterOptions() {
  const results = {};

  try {
    // Get all attributes to map slugs -> IDs
    const { data: allAttributes } = await wcApi.get("products/attributes", {
      per_page: 100,
    });

    for (const slug of ATTRIBUTES) {
      const attr = allAttributes.find((a) => a.slug === slug);
      if (!attr) {
        results[slug] = [];
        continue;
      }

      // Fetch terms using attribute ID
      const { data: terms } = await wcApi.get(
        `products/attributes/${attr.id}/terms`,
        { per_page: 100 }
      );

      results[slug] = terms.map((term) => ({
        id: term.id,
        name: term.name,
        slug: term.slug,
        count: term.count,
      }));
    }

    return results;
  } catch (error) {
    console.error("Error fetching filter options:", error.message);
    // return empty but keep success
    return ATTRIBUTES.reduce((acc, slug) => ({ ...acc, [slug]: [] }), {});
  }
}
