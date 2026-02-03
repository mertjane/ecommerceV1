import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia",
});

/**
 * Create a PaymentIntent for an order
 * @param {Object} params - Payment parameters
 * @param {number} params.amount - Amount in smallest currency unit (pence for GBP)
 * @param {string} params.currency - Currency code (e.g., 'gbp')
 * @param {number} params.orderId - WooCommerce order ID
 * @param {string} params.orderKey - WooCommerce order key
 * @param {Object} params.metadata - Additional metadata
 * @returns {Promise<Object>} PaymentIntent object
 */
export const createPaymentIntent = async ({
  amount,
  currency = "gbp",
  orderId,
  orderKey,
  customerEmail,
  metadata = {},
}) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount), // Ensure integer (pence)
      currency: currency.toLowerCase(),
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        orderId: String(orderId),
        orderKey: orderKey,
        ...metadata,
      },
      receipt_email: customerEmail,
      description: `Order #${orderId}`,
    });

    console.log("[Stripe] PaymentIntent created:", paymentIntent.id);

    return {
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  } catch (error) {
    console.error("[Stripe] Failed to create PaymentIntent:", error.message);
    throw new Error(error.message || "Failed to create payment");
  }
};

/**
 * Retrieve a PaymentIntent by ID
 * @param {string} paymentIntentId - The PaymentIntent ID
 * @returns {Promise<Object>} PaymentIntent object
 */
export const getPaymentIntent = async (paymentIntentId) => {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return {
      success: true,
      paymentIntent: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        metadata: paymentIntent.metadata,
      },
    };
  } catch (error) {
    console.error("[Stripe] Failed to retrieve PaymentIntent:", error.message);
    throw new Error("Failed to retrieve payment status");
  }
};

/**
 * Confirm payment was successful and return order info
 * @param {string} paymentIntentId - The PaymentIntent ID
 * @returns {Promise<Object>} Payment confirmation
 */
export const confirmPayment = async (paymentIntentId) => {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    const isSuccessful = paymentIntent.status === "succeeded";
    const orderId = paymentIntent.metadata?.orderId;
    const orderKey = paymentIntent.metadata?.orderKey;

    return {
      success: true,
      isPaymentSuccessful: isSuccessful,
      status: paymentIntent.status,
      orderId,
      orderKey,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
    };
  } catch (error) {
    console.error("[Stripe] Failed to confirm payment:", error.message);
    throw new Error("Failed to confirm payment");
  }
};

/**
 * Handle Stripe webhook events
 * @param {string} payload - Raw request body
 * @param {string} signature - Stripe signature header
 * @param {string} webhookSecret - Webhook signing secret
 * @returns {Object} Parsed event
 */
export const constructWebhookEvent = (payload, signature, webhookSecret) => {
  try {
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    console.error("[Stripe] Webhook signature verification failed:", error.message);
    throw new Error("Webhook signature verification failed");
  }
};

/**
 * Get Stripe publishable key
 * @returns {string} Publishable key
 */
export const getPublishableKey = () => {
  return process.env.STRIPE_PUBLISHABLE_KEY;
};

export default {
  createPaymentIntent,
  getPaymentIntent,
  confirmPayment,
  constructWebhookEvent,
  getPublishableKey,
};
