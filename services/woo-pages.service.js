import redisClient from "../config/redis.js";
import { ALL_PAGE_SLUGS, PAGE_SLUGS } from "../utils/page-slugs.js";

// Cache TTL 24 hours
const CACHE_TTL = 60 * 60 * 24;

/**
 * Fetch a page from WordPress by slug
 */
const fetchPageFromWordPress = async (slug) => {
  try {
    const wpUrl = process.env.WC_SITE_URL;

    // For blog, we fetch posts instead
    if (slug === PAGE_SLUGS.BLOG) {
      const response = await fetch(
        `${wpUrl}/wp-json/wp/v2/posts?_embed&per_page=12`
      );

      if (!response.ok) {
        throw new Error(`WordPress API error: ${response.status}`);
      }

      const posts = await response.json();

      return posts.map((post) => ({
        id: post.id,
        date: post.date,
        slug: post.slug,
        link: post.link,
        title: post.title?.rendered || "",
        excerpt: post.excerpt?.rendered || "",
        content: post.content?.rendered || "",
        og_image: post.yoast_head_json?.og_image || [],
        categories: post._embedded?.["wp:term"]?.[0]?.map((cat) => cat.name) || [],
      }));
    }

    // For regular pages
    const response = await fetch(
      `${wpUrl}/wp-json/wp/v2/pages?slug=${slug}`
    );

    if (!response.ok) {
      throw new Error(`WordPress API error: ${response.status}`);
    }

    const pages = await response.json();

    if (!pages || pages.length === 0) {
      return null;
    }

    const page = pages[0];

    return {
      id: page.id,
      date: page.date,
      slug: page.slug,
      link: page.link,
      title: page.title?.rendered || "",
      content: page.content?.rendered || "",
      excerpt: page.excerpt?.rendered || "",
      og_image: page.yoast_head_json?.og_image || [],
    };
  } catch (error) {
    console.error(`Error fetching page ${slug}:`, error.message);
    throw error;
  }
};

/**
 * Get a page by slug (with Redis caching)
 */
export const fetchPageBySlug = async (slug) => {
  const cacheKey = `page:${slug}`;

  // Check Redis cache first
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    console.log(`✓ [CACHE HIT] Serving page from Redis: ${cacheKey}`);
    return JSON.parse(cached);
  }

  console.log(`✗ [CACHE MISS] Fetching page from WordPress API: ${cacheKey}`);

  try {
    const pageData = await fetchPageFromWordPress(slug);

    if (!pageData) {
      const errorResult = {
        success: false,
        message: "Page not found",
        error: "Not found",
      };
      return errorResult;
    }

    const result = {
      success: true,
      message: "Page fetched successfully",
      data: pageData,
    };

    // Cache the page
    await redisClient.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL);
    console.log(`✓ [CACHED] Page saved to Redis (TTL: ${CACHE_TTL}s): ${cacheKey}`);

    return result;
  } catch (error) {
    console.error("Page fetch error:", error.message);
    throw new Error("Failed to fetch page");
  }
};

/**
 * Warm up cache for all pages
 * This function fetches all pages and caches them
 */
export const warmUpCache = async () => {
  console.log("🔥 [CACHE WARMING] Starting cache warm-up for all pages...");

  const results = {
    success: [],
    failed: [],
  };

  for (const slug of ALL_PAGE_SLUGS) {
    try {
      console.log(`🔄 [CACHE WARMING] Fetching page: ${slug}`);
      await fetchPageBySlug(slug);
      results.success.push(slug);
      console.log(`✓ [CACHE WARMING] Successfully cached: ${slug}`);
    } catch (error) {
      console.error(`✗ [CACHE WARMING] Failed to cache ${slug}:`, error.message);
      results.failed.push(slug);
    }
  }

  console.log(
    `✓ [CACHE WARMING] Completed! Success: ${results.success.length}, Failed: ${results.failed.length}`
  );

  return results;
};

/**
 * Schedule cache warming every 24 hours
 */
export const scheduleCacheWarming = () => {
  // Warm up cache immediately on startup
  warmUpCache();

  // Schedule cache warming every 24 hours
  setInterval(() => {
    console.log("⏰ [SCHEDULED] Running scheduled cache warm-up...");
    warmUpCache();
  }, CACHE_TTL * 1000);

  console.log(`⏰ [SCHEDULED] Cache warming scheduled every ${CACHE_TTL / 60 / 60} hours`);
};
