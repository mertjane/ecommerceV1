import { Router } from "express";
import {
  getOrders,
  getOrder,
  updateBilling,
  updateShipping,
  updateAccountProfile,
  updatePassword,
} from "../controllers/account.controller.js";

const router = Router();

// Orders
router.get("/orders", getOrders);
router.get("/orders/:id", getOrder);

// Addresses
router.put("/address/billing", updateBilling);
router.put("/address/shipping", updateShipping);

// Profile
router.put("/profile", updateAccountProfile);
router.post("/change-password", updatePassword);

export default router;
