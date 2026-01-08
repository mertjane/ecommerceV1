import { Router } from "express";
import { getPostsController, getPostBySlugController } from "../controllers/posts.controller.js";

const router = Router();

// Get all posts
router.get("/", getPostsController);

// Get single post by slug
router.get("/:slug", getPostBySlugController);

export default router;
