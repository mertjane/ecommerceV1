import express from "express";
import {
  getShippingZonesHandler,
  calculateShippingHandler,
  selectShippingHandler,
  getShippingCountriesHandler,
  clearShippingCacheHandler,
  calculateShippingDirectHandler,
  calculateShippingSmartHandler,
} from "../controllers/shipping.controller.js";

const router = express.Router();

// Get all shipping zones (admin/debugging)
router.get("/zones", getShippingZonesHandler);

// Calculate shipping rates for address (uses WooCommerce Store API)
router.post("/calculate", calculateShippingHandler);

// Calculate shipping rates using custom WooCommerce endpoint (direct package calculation)
// Body: { items: [{ productId, variationId?, quantity }], destination: { country, postcode?, state?, city? } }
router.post("/calculate-direct", calculateShippingDirectHandler);

// Calculate shipping with automatic fallback (custom endpoint -> Store API)
// Body: { country, postcode?, state?, city? }
// Headers: x-cart-token (required)
router.post("/calculate-smart", calculateShippingSmartHandler);

// Select a shipping method
router.post("/select", selectShippingHandler);

// Get available shipping countries
router.get("/countries", getShippingCountriesHandler);

// Clear shipping cache (admin)
router.post("/cache/clear", clearShippingCacheHandler);

export default router;
