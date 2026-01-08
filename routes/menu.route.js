import express from "express";
import redis from "../config/redis.js";
import { normalizeMenu } from "../utils/normalizeMenu.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const cacheKey = "wp:menu:primary";

  try {
    // check Redis cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({ source: "cache", data: JSON.parse(cached) });
    }

    // fetch menu from WordPress REST API
    const wpRes = await fetch(`${process.env.WC_SITE_URL}/wp-json/custom/v1/megamenu`);
    if (!wpRes.ok) {
      throw new Error(`WP error ${wpRes.status}`);
    }
    const data = await wpRes.json();

    // normalize into clean tree
    const normalized = normalizeMenu(data);

    // cache in Redis for 5 minutes
    await redis.set(cacheKey, JSON.stringify(normalized), "EX", 300);

    res.json({ source: "origin", data: normalized });
  } catch (error) {
    console.error("Menu route error:", error);
    res.status(500).json({ message: "Failed to fetch menu", error: error.message });
  }
});

export default router;
