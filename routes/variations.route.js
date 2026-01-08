import express from "express";
import { getProductVariation, getProductVariations } from "../controllers/variations.controller.js";

const router = express.Router();

/**
 * @route   GET /api/variations/:productId
 * @desc    Get all variations for a product
 * @access  Public
 */
router.get("/:productId", getProductVariations);

/**
 * @route   GET /api/variations/:productId/:variationId
 * @desc    Get a single product variation
 * @access  Public
 */
router.get("/:productId/:variationId", getProductVariation);

export default router;
