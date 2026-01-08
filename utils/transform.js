// Meta builder
export const buildMeta = ({ page, per_page, totalPages, totalProducts }) => ({
  current_page: parseInt(page),
  per_page: parseInt(per_page),
  total_pages: totalPages,
  total_products: totalProducts,
  has_next_page: parseInt(page) < totalPages,
  has_prev_page: parseInt(page) > 1,
});


// Woocommerce product JSON builder
export const transformProducts = (products) => {
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    slug: product.slug,
    permalink: product.permalink,
    date_created: product.date_created,
    date_created_gmt: product.date_created_gmt,
    date_modified: product.date_modified,
    date_modified_gmt: product.date_modified_gmt,
    price: product.price,
    regular_price: product.regular_price,
    sale_price: product.sale_price,
    price_html: (() => {
      const match = product.price_html?.match(/>(£|\$|&pound;)?\s*([\d.,]+)/);
      return match ? match[2] : "";
    })(),
    stock_status: product.stock_status,
    categories: product.categories || [],
    images: product.images || [],
    attributes: product.attributes || [],
    variations: product.variations || [],
    yoast_head_json: {
      og_image: product.yoast_head_json?.og_image || [],
    },
  }));
};
