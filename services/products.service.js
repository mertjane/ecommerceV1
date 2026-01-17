import redisClient from "../config/redis.js";
import wcApi from "../config/woocommerce.js";
import { transformProducts } from "../utils/transform.js";

const CACHE_KEY = "products:all_search_data";
const CACHE_TTL = 60 * 60 * 24; // 24 hours


/**
 * Fetch All Products in Woocommerce and Cache
 * Strategy: Cache Aside
 */
export async function fetchAllProducts(forceRefresh = false) {
  try {
    // 1. Only return cache if we AREN'T forcing a refresh
    if(!forceRefresh) {
      const cachedData = await redisClient.get(CACHE_KEY);
      if (cachedData) {
        console.log("Fetching products from Redis Cache...");
        return JSON.parse(cachedData);
      }
    }

    console.log("Fetching fresh data from WooCommerce...");

    // 2. If Cache Miss, Fetch from WooCommerce (Slower, handles pagination)
    console.log("Cache miss. Fetching from WooCommerce API...");
    
    let allProducts = [];
    let page = 1;
    let fetching = true;

    // Loop until we get all products (WooCommerce limits per_page to 100 max)
    while (fetching) {
      const response = await wcApi.get("products", {
        per_page: 100, // Max allowed by WC
        page: page,
        status: "publish", // Only get active products
      });

      const products = response.data;

      if (products.length === 0) {
        fetching = false; // Stop if no products returned
      } else {
        allProducts = allProducts.concat(products);
        page++; // Go to next page
      }
    }

    // 3. Transform Data (Keep only what you need for Search)
    // This reduces RAM usage and Redis storage size significantly
    const transformedData = transformProducts(allProducts);

    // 4. Save to Redis for next time
    // 'EX' sets the expiration time in seconds
    if (transformedData.length > 0) {
      await redisClient.set(
        CACHE_KEY, 
        JSON.stringify(transformedData), 
        "EX", 
        CACHE_TTL
      );
      console.log(`Cache updated: ${transformedData.length} products stored.`);
    }
    return transformedData;

  } catch (error) {
    console.error("Error in fetchAllProducts:", error);
    // Fallback: return empty array or throw, depending on your app needs
    return [];
  }
}


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


/**
 * Redis Warming Up for Categories
 * @param {boolean} forceRefresh - If true, fetches fresh data even if cache exists
 */
export async function cacheAllCategoriesOnStart(forceRefresh = false) {
  try {
    // 1. If not forcing a refresh, check if we already have categories
    if (!forceRefresh) {
      const existingKeys = await redisClient.keys("category:*");
      if (existingKeys.length > 0) {
        console.log("Categories already in cache. Skipping warmup.");
        return;
      }
    }

    console.log("Refreshing Category Cache from WooCommerce...");
   
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
        console.log("(Stop: Detected duplicate page / Infinite loop)");
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
      console.log(`Cached ${data.length} categories from page ${page}`);
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


/**
 * Fetch Products by Category (In-Memory Version)
 * Complexity: O(n) Filter + O(m log m) Sort
 */
export async function fetchProductsByCategory({ 
  categoryId, 
  page = 1, 
  perPage = 12, 
  orderby = 'date', 
  order = 'desc' 
}) {
  
  // 1. GET DATA (Instant from Redis/RAM)
  const allProducts = await fetchAllProducts();

  // 2. FILTER: Linear Search O(n)
  // Find products where one of their categories matches the requested categoryId
  const categoryProducts = allProducts.filter(product => {
    // product.categories is array: [{id: 12, name: '...'}, {id: 45, ...}]
    // We check if ANY category in the list matches our target ID
    return product.categories.some(cat => cat.id == categoryId);
  });

  // 3. SORT: O(m log m)
  // We need to manually sort because we aren't asking the DB anymore
  const sortedProducts = categoryProducts.sort((a, b) => {
    let comparison = 0;

    switch (orderby) {
      case 'price':
        // Handle price sorting (parse strings to floats)
        const priceA = parseFloat(a.price || 0);
        const priceB = parseFloat(b.price || 0);
        comparison = priceA - priceB;
        break;
        
      case 'title':
      case 'name':
        // Alphabetical sort
        comparison = a.name.localeCompare(b.name);
        break;
        
      case 'date':
      default:
        // Date sort (Newest first is standard)
        // Convert ISO strings to dates
        const dateA = new Date(a.date_created);
        const dateB = new Date(b.date_created);
        comparison = dateA - dateB;
        break;
    }

    // Apply Order (Ascending vs Descending)
    return order === 'desc' ? comparison * -1 : comparison;
  });

  // 4. PAGINATION: O(1)
  // Calculate slice indices
  const totalProducts = sortedProducts.length;
  const totalPages = Math.ceil(totalProducts / parseInt(perPage));
  const startIndex = (parseInt(page) - 1) * parseInt(perPage);
  const endIndex = startIndex + parseInt(perPage);

  // Get the specific chunk for this page
  const paginatedProducts = sortedProducts.slice(startIndex, endIndex);

  console.log(`[CATEGORY] Served ${paginatedProducts.length} items from cache for CatID: ${categoryId}`);

  return {
    // Note: Data is already transformed in fetchAllProducts, 
    // but if you need specific field filtering, you can map it here.
    products: paginatedProducts, 
    totalProducts,
    totalPages,
  };
}

/**
 * GET /wp-json/wc/v3/products?orderby=popularity&order=desc
 * Goal to get the most popular product 12 of them only with using /utils/transform.js
 * _fields should be _fields: 'id,name,slug,permalink, price_html,images (only the first image),attributes,stock_status,categories,yoast_head_json'
 */
export async function fetchPopularProducts(forceRefresh = false) {
  const cacheKey = "products:popular";

  try {
    // 1. Check Redis cache ONLY if NOT forcing a refresh
    if (!forceRefresh) {
      const cachedData = await redisClient.get(cacheKey);
      if (cachedData) {
        console.log("Serving Popular Products from Cache.");
        return JSON.parse(cachedData);
      }
    }

    // 2. Fetch fresh data from WooCommerce
    console.log("Fetching fresh Popular Products from WooCommerce...");
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

    // 3. Update the cache for 24 hours
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
 * @param {boolean} forceRefresh - Pass through to trigger fresh fetch
 */
export async function cachePopularProductsOnStart(forceRefresh = false) {
  try {
    console.log("Warming up Popular Products Cache...");
    await fetchPopularProducts(forceRefresh);
    console.log("Popular Products Cache Warmup Complete!");
  } catch (error) {
    console.error("Failed to warm up popular products cache:", error.message);
  }
}


/**
 * Fetch new arrival products (from last 2 months)
 * @param {number} page - Page number
 * @param {number} perPage - Items per page
 * @returns {Promise<Object>} - Products and metadata
 * Optimized: Uses In-Memory Cache (Big O Linear Search)
 */
/**

 */
/**
 * Fetch a single product by slug
 * Uses in-memory cache for fast lookups
 * @param {string} slug - Product slug
 * @returns {Promise<Object|null>} - Product or null if not found
 */
export async function fetchProductBySlug(slug) {
  try {
    // 1. GET DATA (Instant from Redis/RAM)
    const allProducts = await fetchAllProducts();

    // 2. Find product by slug: O(n)
    const product = allProducts.find(p => p.slug === slug);

    if (!product) {
      console.log(`[PRODUCT] Product not found for slug: ${slug}`);
      return null;
    }

    console.log(`[PRODUCT] Found product: ${product.name} (${product.id})`);
    return product;
  } catch (error) {
    console.error("Error fetching product by slug:", error);
    return null;
  }
}

export async function fetchNewArrivals(page = 1, perPage = 12) {
  try {
    // 1. GET DATA (Instant from Redis/RAM)
    const allProducts = await fetchAllProducts();

    // 2. Calculate Date Threshold (2 Months Ago)
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    
    // Convert to timestamp for slightly faster comparison in the loop
    const thresholdTime = twoMonthsAgo.getTime();

    console.log(`[NEW ARRIVALS] Filtering products created after: ${twoMonthsAgo.toISOString()}`);

    // 3. FILTER ALGORITHM: O(n)
    // Scan all products and keep only those newer than the threshold
    const recentProducts = allProducts.filter(product => {
      // Safety check: ensure date exists
      if (!product.date_created) return false;
      
      const productDate = new Date(product.date_created).getTime();
      return productDate >= thresholdTime;
    });

    // 4. SORT ALGORITHM: O(m log m)
    // Sort by Date Descending (Newest first)
    // Note: If your fetchAllProducts list is NOT guaranteed to be sorted by date, this is necessary.
    recentProducts.sort((a, b) => {
      return new Date(b.date_created) - new Date(a.date_created);
    });

    // 5. PAGINATION: O(1)
    const totalProducts = recentProducts.length;
    const totalPages = Math.ceil(totalProducts / parseInt(perPage));
    const startIndex = (parseInt(page) - 1) * parseInt(perPage);
    const paginatedProducts = recentProducts.slice(startIndex, startIndex + parseInt(perPage));

    console.log(`[NEW ARRIVALS] Found ${totalProducts} new items. Serving page ${page}.`);

    return {
      // Data is already transformed in fetchAllProducts
      products: paginatedProducts,
      totalProducts,
      totalPages,
      page: parseInt(page),
      per_page: parseInt(perPage),
    };

  } catch (error) {
    console.error("Error fetching new arrivals:", error);
    // Return empty structure on error to prevent frontend crash
    return {
      products: [],
      totalProducts: 0,
      totalPages: 0,
      page: parseInt(page),
      per_page: parseInt(perPage),
    };
  }
}