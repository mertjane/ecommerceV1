import { Router } from "express";
import {
  searchProductsController,
  getSearchSuggestionsController,
} from "../controllers/search.controller.js";

const router = Router();

// Search products by name and category
// GET /api/search?q=marble&category=tiles&page=1&per_page=12
router.get("/", searchProductsController);

// Get search suggestions for autocomplete
// GET /api/search/suggestions?q=mar&limit=5
router.get("/suggestions", getSearchSuggestionsController);

export default router;
