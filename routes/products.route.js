import { Router } from "express";
import { getCategoryProducts, getCategories, getPopularProducts, getNewArrivals, getProductBySlug } from "../controllers/products.controller.js";

const router = Router();


router.get("/categories", getCategories);
router.get("/popular", getPopularProducts);
router.get("/new-arrivals", getNewArrivals);
// GET /api/products/category/:slug
router.get("/category/:slug", getCategoryProducts);
// GET /api/products/slug/:slug - Single product by slug
router.get("/slug/:slug", getProductBySlug);


export default router;
