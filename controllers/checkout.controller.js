import {
  getPaymentGateways,
  placeOrder,
  getOrder,
  getOrderByKey,
  confirmOrderPayment,
  createOrderDirect,
  updateOrderStatus,
} from "../services/checkout.service.js";
import {
  createPaymentIntent,
  confirmPayment as confirmStripePayment,
  getPublishableKey,
} from "../services/stripe.service.js";
import {
  createPayPalOrder,
  capturePayPalOrder,
  getPayPalOrder,
  getClientId as getPayPalClientId,
} from "../services/paypal.service.js";
import { sendOrderConfirmationEmail } from "../services/email.service.js";
import { successResponse, handleError } from "../utils/response.js";

/**
 * Extract cart token from request headers
 */
const getCartToken = (req) => {
  return req.headers["x-cart-token"] || null;
};

/**
 * Get available payment gateways
 * GET /api/checkout/payment-gateways
 */
export const getPaymentGatewaysHandler = async (req, res) => {
  try {
    const cartToken = getCartToken(req);

    if (!cartToken) {
      return handleError(res, "Cart session required", 400);
    }

    const result = await getPaymentGateways(cartToken);

    return successResponse(
      res,
      { paymentMethods: result.methods },
      "Payment gateways retrieved successfully"
    );
  } catch (error) {
    return handleError(
      res,
      error.message || "Failed to get payment gateways",
      error.status || 500
    );
  }
};

/**
 * Place order and get payment redirect URL
 * POST /api/checkout/place-order
 * Body: {
 *   billingAddress: Address,
 *   shippingAddress: Address,
 *   shippingMethodId: string,
 *   paymentMethod: string,
 *   customerNote?: string,
 *   createAccount?: boolean,
 *   password?: string
 * }
 */
export const placeOrderHandler = async (req, res) => {
  try {
    const cartToken = getCartToken(req);

    if (!cartToken) {
      return handleError(res, "Cart session required", 400);
    }

    const {
      billingAddress,
      shippingAddress,
      shippingMethodId,
      shippingMethodTitle,
      shippingCost,
      paymentMethod,
      customerNote,
      createAccount,
      password,
      useDirectApi, // Option to use REST API instead of Store API
      customerId, // WooCommerce customer ID for authenticated users
    } = req.body;

    // Validate required fields
    if (!billingAddress) {
      return handleError(res, "Billing address is required", 400);
    }

    if (!shippingAddress) {
      return handleError(res, "Shipping address is required", 400);
    }

    if (!billingAddress.email) {
      return handleError(res, "Email address is required", 400);
    }

    if (!paymentMethod) {
      return handleError(res, "Payment method is required", 400);
    }

    // Validate required address fields
    const requiredFields = ["first_name", "last_name", "address_1", "city", "postcode", "country"];
    for (const field of requiredFields) {
      if (!billingAddress[field]) {
        return handleError(res, `Billing ${field.replace("_", " ")} is required`, 400);
      }
      if (!shippingAddress[field]) {
        return handleError(res, `Shipping ${field.replace("_", " ")} is required`, 400);
      }
    }

    let result;

    // Use direct REST API if specified or as fallback
    if (useDirectApi) {
      result = await createOrderDirect(cartToken, {
        billingAddress,
        shippingAddress,
        shippingMethodId,
        shippingMethodTitle,
        shippingCost,
        paymentMethod,
        customerNote,
        customerId, // Link order to WooCommerce customer
      });
    } else {
      // Try Store API first, fall back to REST API
      try {
        result = await placeOrder(cartToken, {
          billingAddress,
          shippingAddress,
          shippingMethodId,
          paymentMethod,
          customerNote,
          createAccount,
          password,
        });
      } catch (storeApiError) {
        console.warn("[Checkout] Store API failed, falling back to REST API:", storeApiError.message);

        result = await createOrderDirect(cartToken, {
          billingAddress,
          shippingAddress,
          shippingMethodId,
          shippingMethodTitle,
          shippingCost,
          paymentMethod,
          customerNote,
          customerId, // Link order to WooCommerce customer
        });
      }
    }

    const responseData = {
      orderId: result.orderId,
      orderKey: result.orderKey,
      status: result.status,
      paymentUrl: result.paymentUrl,
      paymentRequired: result.paymentRequired,
      totals: result.totals,
    };

    console.log("[Checkout] Sending response to frontend:", JSON.stringify(responseData, null, 2));

    return successResponse(res, responseData, "Order created successfully");
  } catch (error) {
    console.error("[Checkout] Place order error:", error);
    return handleError(
      res,
      error.message || "Failed to place order",
      error.status || 500
    );
  }
};

/**
 * Get order details
 * GET /api/checkout/order/:orderId
 */
export const getOrderHandler = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { orderKey } = req.query;

    if (!orderId) {
      return handleError(res, "Order ID is required", 400);
    }

    let result;

    // If orderKey is provided, use it for guest order lookup
    if (orderKey) {
      result = await getOrderByKey(orderId, orderKey);
    } else {
      result = await getOrder(orderId);
    }

    return successResponse(res, { order: result.order }, "Order retrieved successfully");
  } catch (error) {
    return handleError(
      res,
      error.message || "Failed to get order",
      error.status || 500
    );
  }
};

/**
 * Confirm order payment (called after redirect from payment gateway)
 * POST /api/checkout/order/:orderId/confirm
 * Body: { orderKey: string }
 */
export const confirmOrderHandler = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { orderKey } = req.body;

    if (!orderId) {
      return handleError(res, "Order ID is required", 400);
    }

    if (!orderKey) {
      return handleError(res, "Order key is required", 400);
    }

    const result = await confirmOrderPayment(orderId, orderKey);

    return successResponse(
      res,
      { order: result.order },
      result.order.isPaid ? "Payment confirmed" : "Payment pending"
    );
  } catch (error) {
    return handleError(
      res,
      error.message || "Failed to confirm payment",
      error.status || 500
    );
  }
};

/**
 * Webhook handler for payment notifications
 * POST /api/checkout/webhook
 * This endpoint receives notifications from payment gateways
 */
export const webhookHandler = async (req, res) => {
  try {
    const { event, order_id, status } = req.body;

    console.log("[Checkout] Webhook received:", { event, order_id, status });

    // WooCommerce handles most webhook processing internally
    // This endpoint is for custom notifications if needed

    // Acknowledge receipt
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("[Checkout] Webhook error:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
};

/**
 * Get Stripe publishable key
 * GET /api/checkout/stripe/config
 */
export const getStripeConfigHandler = async (req, res) => {
  try {
    const publishableKey = getPublishableKey();

    if (!publishableKey) {
      return handleError(res, "Stripe is not configured", 500);
    }

    return successResponse(
      res,
      { publishableKey },
      "Stripe configuration retrieved"
    );
  } catch (error) {
    return handleError(res, "Failed to get Stripe configuration", 500);
  }
};

/**
 * Create Stripe PaymentIntent for an order
 * POST /api/checkout/stripe/create-payment-intent
 * Body: { orderId: number, orderKey: string }
 */
export const createPaymentIntentHandler = async (req, res) => {
  try {
    const { orderId, orderKey, amount, currency, customerEmail } = req.body;

    if (!orderId || !orderKey) {
      return handleError(res, "Order ID and order key are required", 400);
    }

    if (!amount || amount <= 0) {
      return handleError(res, "Valid amount is required", 400);
    }

    // Convert amount to smallest currency unit (pence for GBP)
    const amountInPence = Math.round(parseFloat(amount) * 100);

    const result = await createPaymentIntent({
      amount: amountInPence,
      currency: currency || "gbp",
      orderId,
      orderKey,
      customerEmail,
    });

    return successResponse(
      res,
      {
        clientSecret: result.clientSecret,
        paymentIntentId: result.paymentIntentId,
      },
      "PaymentIntent created"
    );
  } catch (error) {
    console.error("[Stripe] Create PaymentIntent error:", error);
    return handleError(
      res,
      error.message || "Failed to create payment",
      error.status || 500
    );
  }
};

/**
 * Confirm Stripe payment and update WooCommerce order
 * POST /api/checkout/stripe/confirm-payment
 * Body: { paymentIntentId: string }
 */
export const confirmStripePaymentHandler = async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return handleError(res, "Payment intent ID is required", 400);
    }

    // Verify payment with Stripe
    const paymentResult = await confirmStripePayment(paymentIntentId);

    if (!paymentResult.isPaymentSuccessful) {
      return handleError(
        res,
        `Payment not successful. Status: ${paymentResult.status}`,
        400
      );
    }

    // Update WooCommerce order status to processing
    const { orderId, orderKey } = paymentResult;

    if (orderId) {
      try {
        await updateOrderStatus(orderId, "processing", {
          paymentIntentId,
          paymentMethod: "stripe",
        });
        console.log("[Stripe] Order", orderId, "marked as processing");

        // Send order confirmation email to customer
        const emailResult = await sendOrderConfirmationEmail(orderId);
        if (emailResult.success) {
          console.log("[Stripe] Order confirmation email sent for order", orderId);
        } else {
          console.warn("[Stripe] Failed to send order email:", emailResult.message);
        }
      } catch (updateError) {
        console.error("[Stripe] Failed to update order status:", updateError.message);
        // Don't fail the request - payment was successful
      }
    }

    return successResponse(
      res,
      {
        success: true,
        orderId,
        orderKey,
        paymentStatus: paymentResult.status,
      },
      "Payment confirmed successfully"
    );
  } catch (error) {
    console.error("[Stripe] Confirm payment error:", error);
    return handleError(
      res,
      error.message || "Failed to confirm payment",
      error.status || 500
    );
  }
};

// ============================================
// PAYPAL PAYMENT HANDLERS
// ============================================

/**
 * Get PayPal client ID for frontend SDK
 * GET /api/checkout/paypal/config
 */
export const getPayPalConfigHandler = async (req, res) => {
  try {
    const clientId = getPayPalClientId();

    if (!clientId) {
      return handleError(res, "PayPal is not configured", 500);
    }

    return successResponse(
      res,
      { clientId },
      "PayPal configuration retrieved"
    );
  } catch (error) {
    return handleError(res, "Failed to get PayPal configuration", 500);
  }
};

/**
 * Create PayPal order for payment
 * POST /api/checkout/paypal/create-order
 * Body: { orderId: number, orderKey: string, amount: number, currency?: string }
 */
export const createPayPalOrderHandler = async (req, res) => {
  try {
    const { orderId, orderKey, amount, currency } = req.body;

    if (!orderId || !orderKey) {
      return handleError(res, "Order ID and order key are required", 400);
    }

    if (!amount || amount <= 0) {
      return handleError(res, "Valid amount is required", 400);
    }

    const result = await createPayPalOrder({
      amount,
      currency: currency || "GBP",
      orderId,
      orderKey,
      description: `Order #${orderId}`,
    });

    return successResponse(
      res,
      {
        paypalOrderId: result.paypalOrderId,
        approvalUrl: result.approvalUrl,
      },
      "PayPal order created"
    );
  } catch (error) {
    console.error("[PayPal] Create order error:", error);
    return handleError(
      res,
      error.message || "Failed to create PayPal order",
      error.status || 500
    );
  }
};

/**
 * Capture PayPal order after customer approval
 * POST /api/checkout/paypal/capture-order
 * Body: { paypalOrderId: string }
 */
export const capturePayPalOrderHandler = async (req, res) => {
  try {
    const { paypalOrderId } = req.body;

    if (!paypalOrderId) {
      return handleError(res, "PayPal order ID is required", 400);
    }

    const captureResult = await capturePayPalOrder(paypalOrderId);

    if (!captureResult.success) {
      return handleError(res, "Failed to capture PayPal payment", 400);
    }

    // Update WooCommerce order status to processing
    const { orderId, orderKey } = captureResult;

    if (orderId) {
      try {
        await updateOrderStatus(orderId, "processing", {
          paypalOrderId,
          captureId: captureResult.captureId,
          paymentMethod: "paypal",
        });
        console.log("[PayPal] Order", orderId, "marked as processing");

        // Send order confirmation email to customer
        const emailResult = await sendOrderConfirmationEmail(orderId);
        if (emailResult.success) {
          console.log("[PayPal] Order confirmation email sent for order", orderId);
        } else {
          console.warn("[PayPal] Failed to send order email:", emailResult.message);
        }
      } catch (updateError) {
        console.error("[PayPal] Failed to update order status:", updateError.message);
        // Don't fail the request - payment was successful
      }
    }

    return successResponse(
      res,
      {
        success: true,
        orderId,
        orderKey,
        paypalOrderId: captureResult.paypalOrderId,
        captureId: captureResult.captureId,
        status: captureResult.status,
      },
      "PayPal payment captured successfully"
    );
  } catch (error) {
    console.error("[PayPal] Capture order error:", error);
    return handleError(
      res,
      error.message || "Failed to capture PayPal payment",
      error.status || 500
    );
  }
};

/**
 * Get PayPal order status
 * GET /api/checkout/paypal/order/:paypalOrderId
 */
export const getPayPalOrderHandler = async (req, res) => {
  try {
    const { paypalOrderId } = req.params;

    if (!paypalOrderId) {
      return handleError(res, "PayPal order ID is required", 400);
    }

    const result = await getPayPalOrder(paypalOrderId);

    return successResponse(
      res,
      {
        paypalOrderId: result.paypalOrderId,
        status: result.status,
        orderId: result.orderId,
        orderKey: result.orderKey,
        amount: result.amount,
        currency: result.currency,
      },
      "PayPal order retrieved"
    );
  } catch (error) {
    console.error("[PayPal] Get order error:", error);
    return handleError(
      res,
      error.message || "Failed to get PayPal order",
      error.status || 500
    );
  }
};

export default {
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
};
