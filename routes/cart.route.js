import express from "express";
import {
  getCartHandler,
  addToCartHandler,
  updateCartItemHandler,
  removeFromCartHandler,
  clearCartHandler,
  applyCouponHandler,
  removeCouponHandler,
  getCartTotalsHandler,
} from "../controllers/cart.controller.js";

const router = express.Router();

// Cart operations
router.get("/", getCartHandler);                           // Get cart
router.delete("/", clearCartHandler);                      // Clear cart

// Item operations
router.post("/add", addToCartHandler);                     // Add item to cart
router.put("/item/:key", updateCartItemHandler);           // Update item quantity
router.delete("/item/:key", removeFromCartHandler);        // Remove item from cart

// Coupon operations
router.post("/coupon", applyCouponHandler);                // Apply coupon
router.delete("/coupon/:code", removeCouponHandler);       // Remove coupon

// Totals
router.get("/totals", getCartTotalsHandler);               // Get cart totals

export default router;
