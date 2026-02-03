import express from "express";
import { fetchMenu } from "../services/menu.service.js";

const router = express.Router();

/**
 * GET /api/menu
 * Get megamenu with 1-hour cache
 */
router.get("/", async (req, res) => {
  try {
    const result = await fetchMenu();
    return res.json(result);
  } catch (error) {
    console.error("Menu route error:", error);
    res.status(500).json({
      message: "Failed to fetch menu",
      error: error.message
    });
  }
});

export default router;
