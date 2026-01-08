import redisClient from "../config/redis.js";

// Cache TTL 6 hours
const CACHE_TTL = 60 * 60 * 6;

/**
 * Fetch blog posts from WordPress
 */
export const fetchPosts = async (query) => {
  const { limit = 6 } = query;
  const cacheKey = `posts:limit=${limit}`;

  // Check Redis cache first
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    console.log("✓ [CACHE HIT] Serving posts from Redis:", cacheKey);
    return JSON.parse(cached);
  }

  console.log("✗ [CACHE MISS] Fetching posts from WordPress API:", cacheKey);

  try {
    const wpUrl = process.env.WC_SITE_URL;
    const response = await fetch(
      `${wpUrl}/wp-json/wp/v2/posts?_embed&per_page=${limit}`
    );

    if (!response.ok) {
      throw new Error(`WordPress API error: ${response.status}`);
    }

    const posts = await response.json();

    const simplifiedPosts = posts.map((post) => ({
      id: post.id,
      date: post.date,
      slug: post.slug,
      link: post.link,
      title: post.title?.rendered || "",
      excerpt: post.excerpt?.rendered || "",
      og_image: post.yoast_head_json?.og_image || [],
      categories: post._embedded?.["wp:term"]?.[0]?.map((cat) => cat.name) || [],
    }));

    const result = {
      success: true,
      message: "Posts fetched successfully",
      data: simplifiedPosts,
    };

    // Cache the posts
    await redisClient.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL);
    console.log(`✓ [CACHED] Posts saved to Redis (TTL: ${CACHE_TTL}s):`, cacheKey);

    return result;
  } catch (error) {
    console.error("Posts fetch error:", error.message);
    throw new Error("Failed to fetch posts");
  }
};

/**
 * Fetch a single blog post by slug
 */
export const fetchPostBySlug = async (slug) => {
  const cacheKey = `post:slug=${slug}`;

  // Check Redis cache first
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    console.log("✓ [CACHE HIT] Serving post from Redis:", cacheKey);
    return JSON.parse(cached);
  }

  console.log("✗ [CACHE MISS] Fetching post from WordPress API:", cacheKey);

  try {
    const wpUrl = process.env.WC_SITE_URL;
    const response = await fetch(
      `${wpUrl}/wp-json/wp/v2/posts?slug=${slug}&_embed`
    );

    if (!response.ok) {
      throw new Error(`WordPress API error: ${response.status}`);
    }

    const posts = await response.json();

    if (!posts || posts.length === 0) {
      throw new Error("Post not found");
    }

    const post = posts[0];

    const simplifiedPost = {
      id: post.id,
      date: post.date,
      slug: post.slug,
      link: post.link,
      title: post.title?.rendered || "",
      content: post.content?.rendered || "",
      excerpt: post.excerpt?.rendered || "",
      og_image: post.yoast_head_json?.og_image || [],
      author: {
        name: post._embedded?.author?.[0]?.name || "Unknown",
        avatar: post._embedded?.author?.[0]?.avatar_urls?.["96"] || null,
      },
      categories:
        post._embedded?.["wp:term"]?.[0]?.map((cat) => cat.name) || [],
      tags: post._embedded?.["wp:term"]?.[1]?.map((tag) => tag.name) || [],
    };

    const result = {
      success: true,
      message: "Post fetched successfully",
      data: simplifiedPost,
    };

    // Cache the post
    await redisClient.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL);
    console.log(`✓ [CACHED] Post saved to Redis (TTL: ${CACHE_TTL}s):`, cacheKey);

    return result;
  } catch (error) {
    console.error("Single post fetch error:", error.message);
    throw error;
  }
};
