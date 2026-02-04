import express from "express";
import {
  getPaymentGatewaysHandler,
  placeOrderHandler,
  getOrderHandler,
  confirmOrderHandler,
  webhookHandler,
  // Stripe
  getStripeConfigHandler,
  createPaymentIntentHandler,
  confirmStripePaymentHandler,
  // PayPal
  getPayPalConfigHandler,
  createPayPalOrderHandler,
  capturePayPalOrderHandler,
  getPayPalOrderHandler,
} from "../controllers/checkout.controller.js";

// Rate limiters for checkout operations
import {
  placeOrderLimiter,
  getOrderLimiter,
  confirmOrderLimiter,
  paymentGatewaysLimiter,
} from "../sec/checkout-limiter.js";

// Rate limiters for payment operations
import {
  stripeConfigLimiter,
  createPaymentIntentLimiter,
  confirmPaymentLimiter,
  webhookLimiter,
  // PayPal
  paypalConfigLimiter,
  createPayPalOrderLimiter,
  capturePayPalOrderLimiter,
} from "../sec/payment-limiter.js";

const router = express.Router();

/**
 * Get available payment gateways
 * GET /api/checkout/payment-gateways
 * Headers: X-Cart-Token (required)
 */
router.get("/payment-gateways", paymentGatewaysLimiter, getPaymentGatewaysHandler);

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
router.post("/place-order", placeOrderLimiter, placeOrderHandler);

/**
 * Get order details
 * GET /api/checkout/order/:orderId
 * Query: orderKey (optional, for guest orders)
 */
router.get("/order/:orderId", getOrderLimiter, getOrderHandler);

/**
 * Confirm order payment (after redirect from payment gateway)
 * POST /api/checkout/order/:orderId/confirm
 * Body: { orderKey: string }
 */
router.post("/order/:orderId/confirm", confirmOrderLimiter, confirmOrderHandler);

/**
 * Payment gateway webhook
 * POST /api/checkout/webhook
 * Note: WooCommerce handles most webhooks internally,
 * this is for custom integrations if needed
 */
router.post("/webhook", webhookLimiter, webhookHandler);

// ============================================
// STRIPE PAYMENT ROUTES
// ============================================

/**
 * Get Stripe publishable key
 * GET /api/checkout/stripe/config
 */
router.get("/stripe/config", stripeConfigLimiter, getStripeConfigHandler);

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
router.post("/stripe/create-payment-intent", createPaymentIntentLimiter, createPaymentIntentHandler);

/**
 * Confirm payment and update WooCommerce order
 * POST /api/checkout/stripe/confirm-payment
 * Body: { paymentIntentId: string }
 */
router.post("/stripe/confirm-payment", confirmPaymentLimiter, confirmStripePaymentHandler);

// ============================================
// PAYPAL PAYMENT ROUTES
// ============================================

/**
 * Get PayPal client ID for frontend SDK
 * GET /api/checkout/paypal/config
 */
router.get("/paypal/config", paypalConfigLimiter, getPayPalConfigHandler);

/**
 * Create PayPal order for payment
 * POST /api/checkout/paypal/create-order
 * Body: {
 *   orderId: number,
 *   orderKey: string,
 *   amount: number (in currency units, e.g., 10.99),
 *   currency?: string (default: 'GBP')
 * }
 */
router.post("/paypal/create-order", createPayPalOrderLimiter, createPayPalOrderHandler);

/**
 * Capture PayPal order after customer approval
 * POST /api/checkout/paypal/capture-order
 * Body: { paypalOrderId: string }
 */
router.post("/paypal/capture-order", capturePayPalOrderLimiter, capturePayPalOrderHandler);

/**
 * Get PayPal order status
 * GET /api/checkout/paypal/order/:paypalOrderId
 */
router.get("/paypal/order/:paypalOrderId", paypalConfigLimiter, getPayPalOrderHandler);

export default router;
