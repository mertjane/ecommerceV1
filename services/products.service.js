import redisClient from "../config/redis.js";
import wcApi from "../config/woocommerce.js";
import { transformProducts } from "../utils/transform.js";

const CACHE_TTL = 60 * 60 * 24; // 24 hours


/**
 * Fetch ALL Cached Categories
 * Used for the /categories route
 */
export async function fetchAllCategories() {
  try {
    const keys = await redisClient.keys("category:*");

    if (keys.length === 0) {
      return [];
    }

    const categoriesJson = await redisClient.mget(keys);

    // Parse AND Filter in one step
    const categories = categoriesJson
      .map((cat) => (cat ? JSON.parse(cat) : null))
      .filter((cat) => cat !== null && cat.name) // Remove empty/bad data
      // ADD THIS MAP TO CLEAN THE OUTPUT
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        count: cat.count
      }));

    return categories;
  } catch (error) {
    console.error("Error fetching all categories:", error);
    return [];
  }
}

export async function fetchCategoryBySlug(slug) {
  const cacheKey = `category:${slug}`;

  try {
    // 1. Check Redis
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      // console.log(`Redis HIT for ${slug}`); // Optional debug
      return JSON.parse(cachedData);
    }

    // 2. Fetch from WooCommerce if missing
    // console.log(`Redis MISS for ${slug} - Fetching from API`);
    const { data } = await wcApi.get("products/categories", { 
      params: { slug } 
    });
    
    const category = data[0] || null;

    // 3. Save to Redis (Set expiry to 24 hours)
    if (category) {
      await redisClient.set(cacheKey, JSON.stringify(category), "EX", CACHE_TTL);
    }

    return category;
  } catch (error) {
    console.error(`Error fetching category ${slug}:`, error);
    return null;
  }
}

// Redis Warming Up 
export async function cacheAllCategoriesOnStart() {
  try {
    console.log("Warming up Category Cache...");
    let page = 1;
    let fetching = true;
    const processedIds = new Set();

    while (fetching) {
      // Pass the object directly for WooCommerce SDK.
      const { data } = await wcApi.get("products/categories", {
        per_page: 100, // Ask for 100 items
        page: page
      });

      if (data.length === 0) {
        fetching = false;
        break;
      }

      // Check for duplicates (Infinite Loop Protection)
      const firstItemId = data[0].id;
      if (processedIds.has(firstItemId)) {
        console.log("   (Stop: Detected duplicate page / Infinite loop)");
        fetching = false;
        break;
      }

      const pipeline = redisClient.pipeline();
      
      data.forEach((cat) => {
        processedIds.add(cat.id);
        if (cat.slug) {
          pipeline.set(`category:${cat.slug}`, JSON.stringify(cat), "EX", 60 * 60 * 24);
        }
      });

      await pipeline.exec();
      console.log(`   Cached ${data.length} categories from page ${page}`);
      page++;
    }
    
    console.log(`Cache Warmup Complete! Total Categories: ${processedIds.size}`);
  } catch (error) {
    console.error("Failed to warm up category cache:", error.message);
  }
}

/**
 * 
 * @param {*} param0 
 * @returns 
 */
export async function fetchSpecialDeals({categoryId, page = 1, perPage = 8}) {
  const params = {
    category: categoryId,
    // Ensure we respect the perPage passed, or default to 8
    per_page: perPage,
    page,
    _fields: 'id,name,slug,permalink,price,regular_price,sale_price,price_html,images,attributes,stock_status,categories,yoast_head_json'
  };

  const { data, headers } = await wcApi.get("products", params);

  const totalProducts = parseInt(headers["x-wp-total"] || 0);
  const totalPages = parseInt(headers["x-wp-totalpages"] || 1);

  return {
    products: transformProducts(data),
    totalProducts,
    totalPages,
  };
}


// Your product fetcher with sorting support
export async function fetchProductsByCategory({ categoryId, page = 1, perPage = 12, orderby = 'date', order = 'desc' }) {
  const params = {
    category: categoryId,
    per_page: perPage,
    page,
    orderby,
    order,
    _fields: 'id,name,slug,permalink,price,regular_price,sale_price,price_html,images,attributes,stock_status'
  };

  const { data, headers } = await wcApi.get("products", params);

  const totalProducts = parseInt(headers["x-wp-total"] || 0);
  const totalPages = parseInt(headers["x-wp-totalpages"] || 1);

  return {
    products: transformProducts(data),
    totalProducts,
    totalPages,
  };
}

/**
 * GET /wp-json/wc/v3/products?orderby=popularity&order=desc
 * Goal to get the most popular product 12 of them only with using /utils/transform.js
 * _fields should be _fields: 'id,name,slug,permalink, price_html,images (only the first image),attributes,stock_status,categories,yoast_head_json'
 */
export async function fetchPopularProducts() {
  const cacheKey = "products:popular";

  try {
    // Check Redis cache first
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // Fetch from WooCommerce if not cached
    const params = {
      orderby: 'popularity',
      order: 'desc',
      per_page: 12,
      _fields: 'id,name,slug,permalink,price_html,images,attributes,stock_status,categories,yoast_head_json'
    };

    const { data } = await wcApi.get("products", params);

    // Transform products and keep only first image
    const products = transformProducts(data).map(product => ({
      ...product,
      images: product.images[0] ? [product.images[0]] : []
    }));

    // Cache for 24 hours
    await redisClient.set(cacheKey, JSON.stringify(products), "EX", CACHE_TTL);

    return products;
  } catch (error) {
    console.error("Error fetching popular products:", error);
    throw error;
  }
}

/**
 * Cache popular products on server start
 * Automatically warms up the cache with 12 most popular products
 */
export async function cachePopularProductsOnStart() {
  try {
    console.log("Warming up Popular Products Cache...");
    await fetchPopularProducts();
    console.log("Popular Products Cache Warmup Complete!");
  } catch (error) {
    console.error("Failed to warm up popular products cache:", error.message);
  }
}