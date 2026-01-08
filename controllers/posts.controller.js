import { fetchPosts, fetchPostBySlug } from "../services/posts.service.js";
import { successResponse, handleError } from "../utils/response.js";

/**
 * GET /api/posts
 * Get blog posts
 */
export const getPostsController = async (req, res) => {
  try {
    const result = await fetchPosts(req.query);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("Error in getPostsController:", error);
    return handleError(res, error, "Failed to fetch posts");
  }
};

/**
 * GET /api/posts/:slug
 * Get a single blog post by slug
 */
export const getPostBySlugController = async (req, res) => {
  try {
    const { slug } = req.params;
    const result = await fetchPostBySlug(slug);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("Error in getPostBySlugController:", error);

    if (error.message === "Post not found") {
      return res.status(404).json({
        success: false,
        error: "Post not found"
      });
    }

    return handleError(res, error, "Failed to fetch post");
  }
};
