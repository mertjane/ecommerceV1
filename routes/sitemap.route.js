import express from "express";
import redisClient from "../config/redis.js";
import wcApi from "../config/woocommerce.js";

const router = express.Router();

// Cache TTL: 1 hour
const CACHE_TTL = 60 * 60;
const CACHE_KEY = "sitemap:urls";

/**
 * GET /api/sitemap/urls
 * Returns all URLs for sitemap generation
 * Cached for 1 hour
 */
router.get("/urls", async (req, res) => {
  try {
    // Check cache first
    const cached = await redisClient.get(CACHE_KEY);
    if (cached) {
      return res.json({
        success: true,
        source: "cache",
        data: JSON.parse(cached),
      });
    }

    // Fetch all products (paginated)
    const products = await fetchAllProductSlugs();

    // Fetch all categories
    const categories = await fetchAllCategorySlugs();

    const data = {
      products,
      categories,
      generatedAt: new Date().toISOString(),
    };

    // Cache the result
    await redisClient.set(CACHE_KEY, JSON.stringify(data), "EX", CACHE_TTL);

    res.json({
      success: true,
      source: "origin",
      data,
    });
  } catch (error) {
    console.error("Sitemap URLs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch sitemap URLs",
      error: error.message,
    });
  }
});

/**
 * Fetch all product slugs with minimal data
 */
async function fetchAllProductSlugs() {
  const products = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { data } = await wcApi.get("products", {
      per_page: 100,
      page,
      status: "publish",
      _fields: "id,slug,date_modified",
    });

    if (data.length === 0) {
      hasMore = false;
    } else {
      products.push(
        ...data.map((p) => ({
          slug: p.slug,
          lastModified: p.date_modified,
        }))
      );
      page++;
    }
  }

  return products;
}

/**
 * Fetch all category slugs
 */
async function fetchAllCategorySlugs() {
  const categories = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { data } = await wcApi.get("products/categories", {
      per_page: 100,
      page,
      _fields: "id,slug,count",
    });

    if (data.length === 0) {
      hasMore = false;
    } else {
      // Only include categories with products
      categories.push(
        ...data
          .filter((c) => c.count > 0)
          .map((c) => ({
            slug: c.slug,
          }))
      );
      page++;
    }
  }

  return categories;
}

export default router;
