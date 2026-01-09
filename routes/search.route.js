import { Router } from "express";
import {
  searchProductsController
} from "../controllers/search.controller.js";

const router = Router();

// Search products by name and category
// GET /api/search?q=marble&category=tiles&page=1&per_page=12
router.get("/", searchProductsController);


export default router;
