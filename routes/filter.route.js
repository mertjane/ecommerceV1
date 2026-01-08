import express from "express";
import { filterProductsController, filterOptionsController } from "../controllers/filter.controller.js";

const router = express.Router();

router.get("/products", filterProductsController);
router.get("/options", filterOptionsController);


export default router;
