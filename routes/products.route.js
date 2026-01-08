import { Router } from "express";
import { getCategoryProducts, getCategories} from "../controllers/products.controller.js";

const router = Router();

router.get("/categories", getCategories);
// GET /api/products/category/:slug
router.get("/category/:slug", getCategoryProducts);


export default router;
