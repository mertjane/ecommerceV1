import axios from "axios";
import crypto from "crypto";
import { getCartForCheckout, deleteCart } from "./cart.service.js";

const WC_SITE_URL = process.env.WC_SITE_URL;
const WC_CONSUMER_KEY = process.env.WC_CONSUMER_KEY;
const WC_CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET;

/**
 * WooCommerce Store API Client
 * Used for checkout operations
 */
const storeApi = axios.create({
  baseURL: `${WC_SITE_URL}/wp-json/wc/store/v1`,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * WooCommerce REST API Client (v3)
 * Used for order management after checkout
 */
const wcRestApi = axios.create({
  baseURL: `${WC_SITE_URL}/wp-json/wc/v3`,
  auth: {
    username: WC_CONSUMER_KEY,
    password: WC_CONSUMER_SECRET,
  },
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Session storage for WooCommerce Store API
 * Maps our cart tokens to WC session tokens
 */
const wcSessionStorage = new Map();

/**
 * Get WC session for cart token
 */
const getWcSession = (cartToken) => {
  return wcSessionStorage.get(cartToken) || null;
};

/**
 * Save WC session from response
 */
const saveWcSession = (cartToken, response) => {
  const wcSession = response.headers["x-wc-session"] || response.headers["cart-token"];
  if (wcSession) {
    wcSessionStorage.set(cartToken, wcSession);
  }
};

/**
 * Build Store API headers
 */
const buildStoreApiHeaders = (cartToken) => {
  const headers = {
    "Content-Type": "application/json",
  };

  const wcSession = getWcSession(cartToken);
  if (wcSession) {
    headers["Cart-Token"] = wcSession;
  }

  return headers;
};

/**
 * Generate nonce for checkout
 */
const generateNonce = () => {
  return crypto.randomBytes(16).toString("hex");
};

/**
 * Sync local cart to WooCommerce Store API
 * This prepares WooCommerce for checkout
 */
const syncCartToWooCommerce = async (cartToken, cartItems) => {
  try {
    const headers = buildStoreApiHeaders(cartToken);

    // First, get or create WC cart session
    try {
      const cartResponse = await storeApi.get("/cart", { headers });
      saveWcSession(cartToken, cartResponse);

      // Clear existing items
      const existingItems = cartResponse.data.items || [];
      for (const item of existingItems) {
        try {
          await storeApi.post(
            "/cart/remove-item",
            { key: item.key },
            { headers: buildStoreApiHeaders(cartToken) }
          );
        } catch (e) {
          // Ignore removal errors
        }
      }
    } catch (e) {
      // Cart doesn't exist yet, that's fine
    }

    // Add each local cart item to WooCommerce
    for (const item of cartItems) {
      try {
        const productIdToAdd = item.variationId || item.productId;

        const addItemPayload = {
          id: productIdToAdd,
          quantity: item.quantity,
        };

        const response = await storeApi.post("/cart/add-item", addItemPayload, {
          headers: buildStoreApiHeaders(cartToken),
        });

        saveWcSession(cartToken, response);
      } catch (error) {
        console.error(
          `[Checkout] Failed to add item ${item.productId} to WC cart:`,
          error.response?.data || error.message
        );
      }
    }

    return true;
  } catch (error) {
    console.error("[Checkout] Failed to sync cart:", error.message);
    throw new Error("Failed to sync cart for checkout");
  }
};

/**
 * Update customer addresses in WooCommerce Store API
 */
const updateCustomerAddresses = async (cartToken, billingAddress, shippingAddress) => {
  try {
    const payload = {
      billing_address: {
        first_name: billingAddress.first_name || "",
        last_name: billingAddress.last_name || "",
        company: billingAddress.company || "",
        address_1: billingAddress.address_1 || "",
        address_2: billingAddress.address_2 || "",
        city: billingAddress.city || "",
        state: billingAddress.state || "",
        postcode: billingAddress.postcode || "",
        country: billingAddress.country || "",
        email: billingAddress.email || "",
        phone: billingAddress.phone || "",
      },
      shipping_address: {
        first_name: shippingAddress.first_name || "",
        last_name: shippingAddress.last_name || "",
        company: shippingAddress.company || "",
        address_1: shippingAddress.address_1 || "",
        address_2: shippingAddress.address_2 || "",
        city: shippingAddress.city || "",
        state: shippingAddress.state || "",
        postcode: shippingAddress.postcode || "",
        country: shippingAddress.country || "",
      },
    };

    const response = await storeApi.post("/cart/update-customer", payload, {
      headers: buildStoreApiHeaders(cartToken),
    });

    saveWcSession(cartToken, response);
    return response.data;
  } catch (error) {
    console.error("[Checkout] Failed to update addresses:", error.response?.data || error.message);
    throw new Error("Failed to update customer addresses");
  }
};

/**
 * Select shipping method in WooCommerce
 */
const selectShippingMethod = async (cartToken, rateId) => {
  try {
    const response = await storeApi.post(
      "/cart/select-shipping-rate",
      {
        package_id: 0,
        rate_id: rateId,
      },
      {
        headers: buildStoreApiHeaders(cartToken),
      }
    );

    saveWcSession(cartToken, response);
    return response.data;
  } catch (error) {
    console.error("[Checkout] Failed to select shipping:", error.response?.data || error.message);
    throw new Error("Failed to select shipping method");
  }
};

/**
 * Get available payment gateways from WooCommerce
 */
export const getPaymentGateways = async (cartToken) => {
  try {
    // Sync cart first to ensure we have a valid WC session
    const cart = await getCartForCheckout(cartToken);
    await syncCartToWooCommerce(cartToken, cart.items);

    // Get checkout data which includes payment methods
    const response = await storeApi.get("/checkout", {
      headers: buildStoreApiHeaders(cartToken),
    });

    saveWcSession(cartToken, response);

    const paymentMethods = response.data.payment_methods || [];

    // Map WooCommerce payment methods to our format
    const formattedMethods = paymentMethods.map((method) => ({
      id: method.id,
      title: method.title,
      description: method.description,
      icon: method.icons?.[0]?.src || null,
      supportsTokenization: method.supports?.includes("tokenization") || false,
    }));

    return {
      success: true,
      methods: formattedMethods,
    };
  } catch (error) {
    console.error("[Checkout] Failed to get payment gateways:", error.response?.data || error.message);

    // Return default methods as fallback
    return {
      success: true,
      methods: [
        { id: "woocommerce_payments", title: "Credit / Debit Card", description: "Pay with card" },
        { id: "ppcp-gateway", title: "PayPal", description: "Pay with PayPal" },
      ],
    };
  }
};

/**
 * Place order using WooCommerce Store API
 * This creates the order and returns payment redirect URL
 *
 * @param {string} cartToken - Our cart session token
 * @param {Object} checkoutData - Checkout information
 * @returns {Object} Order result with redirect URL
 */
export const placeOrder = async (cartToken, checkoutData) => {
  const {
    billingAddress,
    shippingAddress,
    shippingMethodId,
    paymentMethod,
    customerNote,
    createAccount,
    password,
  } = checkoutData;

  try {
    // Step 1: Get our cart data
    console.log("[Checkout] Getting cart for checkout...");
    const cart = await getCartForCheckout(cartToken);

    if (!cart.items || cart.items.length === 0) {
      throw new Error("Cart is empty");
    }

    // Step 2: Sync cart to WooCommerce
    console.log("[Checkout] Syncing cart to WooCommerce...");
    await syncCartToWooCommerce(cartToken, cart.items);

    // Step 3: Update customer addresses
    console.log("[Checkout] Updating customer addresses...");
    await updateCustomerAddresses(cartToken, billingAddress, shippingAddress);

    // Step 4: Select shipping method
    if (shippingMethodId) {
      console.log("[Checkout] Selecting shipping method:", shippingMethodId);
      await selectShippingMethod(cartToken, shippingMethodId);
    }

    // Step 5: Place order via Store API checkout
    console.log("[Checkout] Placing order with payment method:", paymentMethod);

    const checkoutPayload = {
      billing_address: {
        first_name: billingAddress.first_name || "",
        last_name: billingAddress.last_name || "",
        company: billingAddress.company || "",
        address_1: billingAddress.address_1 || "",
        address_2: billingAddress.address_2 || "",
        city: billingAddress.city || "",
        state: billingAddress.state || "",
        postcode: billingAddress.postcode || "",
        country: billingAddress.country || "",
        email: billingAddress.email || "",
        phone: billingAddress.phone || "",
      },
      shipping_address: {
        first_name: shippingAddress.first_name || "",
        last_name: shippingAddress.last_name || "",
        company: shippingAddress.company || "",
        address_1: shippingAddress.address_1 || "",
        address_2: shippingAddress.address_2 || "",
        city: shippingAddress.city || "",
        state: shippingAddress.state || "",
        postcode: shippingAddress.postcode || "",
        country: shippingAddress.country || "",
      },
      payment_method: paymentMethod || "woocommerce_payments",
      customer_note: customerNote || "",
      create_account: createAccount || false,
    };

    // Add password if creating account
    if (createAccount && password) {
      checkoutPayload.password = password;
    }

    const response = await storeApi.post("/checkout", checkoutPayload, {
      headers: buildStoreApiHeaders(cartToken),
    });

    const orderData = response.data;

    console.log("[Checkout] Order created successfully:", orderData.order_id);
    console.log("[Checkout] Payment result:", JSON.stringify(orderData.payment_result, null, 2));

    // Step 6: Clear local cart after successful order
    deleteCart(cartToken);
    wcSessionStorage.delete(cartToken);

    // Get payment redirect URL - try from API response first, then generate manually
    let paymentUrl = orderData.payment_result?.redirect_url || null;

    // If no redirect URL from API, generate it manually for WooCommerce order-pay
    if (!paymentUrl && orderData.order_id && orderData.order_key) {
      paymentUrl = `${WC_SITE_URL}/checkout/order-pay/${orderData.order_id}/?pay_for_order=true&key=${orderData.order_key}`;
      console.log("[Checkout] Generated payment URL manually:", paymentUrl);
    }

    // Determine if payment is required
    const paymentStatus = orderData.payment_result?.payment_status;
    const orderStatus = orderData.status;
    const paymentRequired = paymentStatus === "pending" || orderStatus === "pending" || orderStatus === "checkout-draft";

    console.log("[Checkout] Payment required:", paymentRequired, "Status:", orderStatus, "Payment status:", paymentStatus);

    // Return order information
    return {
      success: true,
      orderId: orderData.order_id,
      orderKey: orderData.order_key,
      status: orderData.status,
      paymentUrl,
      paymentRequired,
      totals: {
        total: orderData.totals?.total_price || "0",
        currency: orderData.totals?.currency_code || "GBP",
      },
    };
  } catch (error) {
    console.error("[Checkout] Order placement failed:", error.response?.data || error.message);

    // Parse WooCommerce error messages
    let errorMessage = "Failed to place order";
    if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.response?.data?.data?.params) {
      // Validation errors
      const params = error.response.data.data.params;
      errorMessage = Object.values(params).join(". ");
    }

    throw new Error(errorMessage);
  }
};

/**
 * Get order details by ID
 */
export const getOrder = async (orderId) => {
  try {
    const { data: order } = await wcRestApi.get(`/orders/${orderId}`);

    return {
      success: true,
      order: {
        id: order.id,
        orderKey: order.order_key,
        status: order.status,
        dateCreated: order.date_created,
        total: order.total,
        currency: order.currency,
        paymentMethod: order.payment_method_title,
        billingAddress: order.billing,
        shippingAddress: order.shipping,
        lineItems: order.line_items.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          total: item.total,
          image: item.image?.src || null,
        })),
        shippingTotal: order.shipping_total,
        customerNote: order.customer_note,
      },
    };
  } catch (error) {
    console.error("[Checkout] Failed to get order:", error.response?.data || error.message);
    throw new Error("Failed to retrieve order details");
  }
};

/**
 * Get order by order key (for guest users)
 */
export const getOrderByKey = async (orderId, orderKey) => {
  try {
    const { data: orders } = await wcRestApi.get("/orders", {
      params: {
        include: [orderId],
      },
    });

    const order = orders.find((o) => o.order_key === orderKey);
    if (!order) {
      throw new Error("Order not found");
    }

    return {
      success: true,
      order: {
        id: order.id,
        orderKey: order.order_key,
        status: order.status,
        dateCreated: order.date_created,
        total: order.total,
        currency: order.currency,
        paymentMethod: order.payment_method_title,
      },
    };
  } catch (error) {
    console.error("[Checkout] Failed to get order by key:", error.message);
    throw new Error("Failed to retrieve order");
  }
};

/**
 * Confirm order payment (called after redirect back from payment gateway)
 */
export const confirmOrderPayment = async (orderId, orderKey) => {
  try {
    // Verify order exists and key matches
    const { data: order } = await wcRestApi.get(`/orders/${orderId}`);

    if (order.order_key !== orderKey) {
      throw new Error("Invalid order key");
    }

    // Check payment status
    const isPaid = ["processing", "completed"].includes(order.status);
    const isPending = order.status === "pending";
    const isFailed = ["failed", "cancelled"].includes(order.status);

    return {
      success: true,
      order: {
        id: order.id,
        status: order.status,
        isPaid,
        isPending,
        isFailed,
        total: order.total,
        currency: order.currency,
        paymentMethod: order.payment_method_title,
      },
    };
  } catch (error) {
    console.error("[Checkout] Payment confirmation failed:", error.message);
    throw new Error("Failed to confirm payment");
  }
};

/**
 * Create order using WooCommerce REST API (alternative approach)
 * This creates order directly without Store API session management
 */
export const createOrderDirect = async (cartToken, checkoutData) => {
  const {
    billingAddress,
    shippingAddress,
    shippingMethodId,
    shippingMethodTitle,
    shippingCost,
    paymentMethod,
    customerNote,
    customerId, // WooCommerce customer ID for authenticated users
  } = checkoutData;

  try {
    // Get cart data
    const cart = await getCartForCheckout(cartToken);

    if (!cart.items || cart.items.length === 0) {
      throw new Error("Cart is empty");
    }

    // Build line items for WooCommerce
    // IMPORTANT: Our prices are per sqm, so we override the line totals
    // to ensure correct pricing (price × sqm, not price × quantity)
    const lineItems = cart.items.map((item) => {
      const lineItem = {
        product_id: item.productId,
        variation_id: item.variationId || 0,
        quantity: item.quantity,
      };

      // If item has sqm pricing, override the totals
      // WooCommerce would otherwise calculate price × quantity
      if (item.sqm && parseFloat(item.sqm) > 0) {
        lineItem.subtotal = item.lineTotal; // price × sqm
        lineItem.total = item.lineTotal;    // price × sqm
        console.log(`[Checkout] Line item ${item.name}: qty=${item.quantity}, sqm=${item.sqm}, price=${item.price}/sqm, total=${item.lineTotal}`);
      }

      return lineItem;
    });

    console.log("[Checkout] Line items with sqm pricing:", JSON.stringify(lineItems, null, 2));

    // Build shipping lines
    const shippingLines = shippingMethodId
      ? [
          {
            method_id: shippingMethodId,
            method_title: shippingMethodTitle || "Shipping",
            total: shippingCost || "0",
          },
        ]
      : [];

    // Create order payload
    const orderPayload = {
      payment_method: paymentMethod || "woocommerce_payments",
      payment_method_title: getPaymentMethodTitle(paymentMethod),
      set_paid: false, // Payment will be handled by redirect
      customer_id: customerId || 0, // 0 = guest order, otherwise links to WC customer
      billing: {
        first_name: billingAddress.first_name || "",
        last_name: billingAddress.last_name || "",
        company: billingAddress.company || "",
        address_1: billingAddress.address_1 || "",
        address_2: billingAddress.address_2 || "",
        city: billingAddress.city || "",
        state: billingAddress.state || "",
        postcode: billingAddress.postcode || "",
        country: billingAddress.country || "",
        email: billingAddress.email || "",
        phone: billingAddress.phone || "",
      },
      shipping: {
        first_name: shippingAddress.first_name || "",
        last_name: shippingAddress.last_name || "",
        company: shippingAddress.company || "",
        address_1: shippingAddress.address_1 || "",
        address_2: shippingAddress.address_2 || "",
        city: shippingAddress.city || "",
        state: shippingAddress.state || "",
        postcode: shippingAddress.postcode || "",
        country: shippingAddress.country || "",
      },
      line_items: lineItems,
      shipping_lines: shippingLines,
      customer_note: customerNote || "",
    };

    // Apply coupons if any
    if (cart.coupons && cart.coupons.length > 0) {
      orderPayload.coupon_lines = cart.coupons.map((coupon) => ({
        code: coupon.code,
      }));
    }

    console.log("[Checkout] Creating order via REST API...");
    console.log("[Checkout] Customer ID:", customerId || "Guest (0)");
    const { data: order } = await wcRestApi.post("/orders", orderPayload);

    console.log("[Checkout] Order created:", order.id, "Status:", order.status, "Customer:", order.customer_id);

    // Clear local cart
    deleteCart(cartToken);

    // Generate payment URL
    const paymentUrl = `${WC_SITE_URL}/checkout/order-pay/${order.id}/?pay_for_order=true&key=${order.order_key}`;
    const paymentRequired = order.status === "pending";

    console.log("[Checkout] REST API - Payment URL:", paymentUrl);
    console.log("[Checkout] REST API - Payment required:", paymentRequired);
    console.log("[Checkout] REST API - Order total:", order.total);

    const result = {
      success: true,
      orderId: order.id,
      orderKey: order.order_key,
      status: order.status,
      paymentUrl,
      paymentRequired,
      totals: {
        total: order.total,
        currency: order.currency,
      },
    };

    console.log("[Checkout] REST API - Returning result:", JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    console.error("[Checkout] Direct order creation failed:", error.response?.data || error.message);
    throw new Error(error.response?.data?.message || "Failed to create order");
  }
};

/**
 * Get payment method title from ID
 */
const getPaymentMethodTitle = (methodId) => {
  const titles = {
    woocommerce_payments: "Credit / Debit Card",
    "ppcp-gateway": "PayPal",
    paypal: "PayPal",
    apple_pay: "Apple Pay",
    google_pay: "Google Pay",
  };
  return titles[methodId] || "Online Payment";
};

/**
 * Update order status in WooCommerce
 * @param {number|string} orderId - Order ID
 * @param {string} status - New status (e.g., 'processing', 'completed', 'cancelled')
 * @param {Object} metadata - Additional data to add to order notes
 */
export const updateOrderStatus = async (orderId, status, metadata = {}) => {
  try {
    const updatePayload = {
      status,
    };

    // Add a note about the payment
    if (metadata.paymentIntentId) {
      updatePayload.meta_data = [
        {
          key: "_stripe_payment_intent_id",
          value: metadata.paymentIntentId,
        },
      ];
    }

    const { data: order } = await wcRestApi.put(`/orders/${orderId}`, updatePayload);

    console.log("[Checkout] Order status updated:", order.id, "->", status);

    return {
      success: true,
      order: {
        id: order.id,
        status: order.status,
      },
    };
  } catch (error) {
    console.error("[Checkout] Failed to update order status:", error.response?.data || error.message);
    throw new Error("Failed to update order status");
  }
};

export default {
  getPaymentGateways,
  placeOrder,
  getOrder,
  getOrderByKey,
  confirmOrderPayment,
  createOrderDirect,
  updateOrderStatus,
};
