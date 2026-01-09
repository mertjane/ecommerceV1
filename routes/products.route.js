import { Router } from "express";
import { getCategoryProducts, getCategories, getPopularProducts } from "../controllers/products.controller.js";

const router = Router();

router.get("/categories", getCategories);
router.get("/popular", getPopularProducts);
// GET /api/products/category/:slug
router.get("/category/:slug", getCategoryProducts);


export default router;
