import express from "express";
import {
  getPaymentGatewaysHandler,
  placeOrderHandler,
  getOrderHandler,
  confirmOrderHandler,
  webhookHandler,
  getStripeConfigHandler,
  createPaymentIntentHandler,
  confirmStripePaymentHandler,
} from "../controllers/checkout.controller.js";

const router = express.Router();

/**
 * Get available payment gateways
 * GET /api/checkout/payment-gateways
 * Headers: X-Cart-Token (required)
 */
router.get("/payment-gateways", getPaymentGatewaysHandler);

/**
 * Place order and get payment redirect URL
 * POST /api/checkout/place-order
 * Headers: X-Cart-Token (required)
 * Body: {
 *   billingAddress: {
 *     first_name, last_name, company?, address_1, address_2?,
 *     city, state?, postcode, country, email, phone?
 *   },
 *   shippingAddress: {
 *     first_name, last_name, company?, address_1, address_2?,
 *     city, state?, postcode, country
 *   },
 *   shippingMethodId: string,
 *   shippingMethodTitle?: string,
 *   shippingCost?: string,
 *   paymentMethod: string (e.g., "woocommerce_payments", "ppcp-gateway"),
 *   customerNote?: string,
 *   createAccount?: boolean,
 *   password?: string
 * }
 *
 * Response: {
 *   success: true,
 *   data: {
 *     orderId: number,
 *     orderKey: string,
 *     status: string,
 *     paymentUrl: string | null,
 *     paymentRequired: boolean,
 *     totals: { total: string, currency: string }
 *   }
 * }
 */
router.post("/place-order", placeOrderHandler);

/**
 * Get order details
 * GET /api/checkout/order/:orderId
 * Query: orderKey (optional, for guest orders)
 */
router.get("/order/:orderId", getOrderHandler);

/**
 * Confirm order payment (after redirect from payment gateway)
 * POST /api/checkout/order/:orderId/confirm
 * Body: { orderKey: string }
 */
router.post("/order/:orderId/confirm", confirmOrderHandler);

/**
 * Payment gateway webhook
 * POST /api/checkout/webhook
 * Note: WooCommerce handles most webhooks internally,
 * this is for custom integrations if needed
 */
router.post("/webhook", webhookHandler);

// ============================================
// STRIPE PAYMENT ROUTES
// ============================================

/**
 * Get Stripe publishable key
 * GET /api/checkout/stripe/config
 */
router.get("/stripe/config", getStripeConfigHandler);

/**
 * Create PaymentIntent for an order
 * POST /api/checkout/stripe/create-payment-intent
 * Body: {
 *   orderId: number,
 *   orderKey: string,
 *   amount: number (in currency units, e.g., 10.99),
 *   currency?: string (default: 'gbp'),
 *   customerEmail?: string
 * }
 */
router.post("/stripe/create-payment-intent", createPaymentIntentHandler);

/**
 * Confirm payment and update WooCommerce order
 * POST /api/checkout/stripe/confirm-payment
 * Body: { paymentIntentId: string }
 */
router.post("/stripe/confirm-payment", confirmStripePaymentHandler);

export default router;
