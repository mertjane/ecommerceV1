import express from "express";
import { getPageBySlug } from "../controllers/woo-pages.controller.js";

const router = express.Router();

/**
 * GET /api/pages/:slug
 * Get a page by slug
 */
router.get("/:slug", getPageBySlug);

export default router;
