import express from "express";
import {
  getShippingZonesHandler,
  calculateShippingHandler,
  getShippingCountriesHandler,
  clearShippingCacheHandler,
} from "../controllers/shipping.controller.js";

const router = express.Router();

// Get all shipping zones
router.get("/zones", getShippingZonesHandler);

// Calculate shipping rates for address
router.post("/calculate", calculateShippingHandler);

// Get available shipping countries
router.get("/countries", getShippingCountriesHandler);

// Clear shipping cache (admin)
router.post("/cache/clear", clearShippingCacheHandler);

export default router;
