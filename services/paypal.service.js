/**
 * PayPal Payment Service
 * Handles PayPal order creation and capture using PayPal REST API v2
 */

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MERCHANT_ID = process.env.PAYPAL_LIVE_MERCHANT_ID;

// Use sandbox for testing, live for production
const PAYPAL_BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

// Frontend URL for return/cancel redirects
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * Get PayPal access token using client credentials
 * @returns {Promise<string>} Access token
 */
const getAccessToken = async () => {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');

  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('[PayPal] Failed to get access token:', errorData);
    throw new Error('Failed to authenticate with PayPal');
  }

  const data = await response.json();
  return data.access_token;
};

/**
 * Create a PayPal order
 * @param {Object} params - Order parameters
 * @param {number} params.amount - Amount in currency units (e.g., 10.99)
 * @param {string} params.currency - Currency code (e.g., 'GBP')
 * @param {number} params.orderId - WooCommerce order ID
 * @param {string} params.orderKey - WooCommerce order key
 * @param {string} params.description - Order description
 * @returns {Promise<Object>} PayPal order object with approval URL
 */
export const createPayPalOrder = async ({
  amount,
  currency = 'GBP',
  orderId,
  orderKey,
  description,
}) => {
  try {
    const accessToken = await getAccessToken();

    const orderData = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: String(orderId),
          description: description || `Order #${orderId}`,
          custom_id: orderKey, // Store orderKey for verification
          amount: {
            currency_code: currency.toUpperCase(),
            value: parseFloat(amount).toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: 'Authentic Stone',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: `${FRONTEND_URL}/checkout/paypal/return?order=${orderId}`,
        cancel_url: `${FRONTEND_URL}/checkout/paypal/cancel?order=${orderId}`,
      },
    };

    const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `order-${orderId}-${Date.now()}`, // Idempotency key
      },
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[PayPal] Failed to create order:', errorData);
      throw new Error(errorData.message || 'Failed to create PayPal order');
    }

    const paypalOrder = await response.json();

    // Find the approval URL
    const approvalLink = paypalOrder.links.find(link => link.rel === 'approve');

    console.log('[PayPal] Order created:', paypalOrder.id);

    return {
      success: true,
      paypalOrderId: paypalOrder.id,
      approvalUrl: approvalLink?.href,
      status: paypalOrder.status,
    };
  } catch (error) {
    console.error('[PayPal] Failed to create order:', error.message);
    throw new Error(error.message || 'Failed to create PayPal payment');
  }
};

/**
 * Capture a PayPal order after approval
 * @param {string} paypalOrderId - The PayPal order ID
 * @returns {Promise<Object>} Capture result
 */
export const capturePayPalOrder = async (paypalOrderId) => {
  try {
    const accessToken = await getAccessToken();

    const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[PayPal] Failed to capture order:', errorData);

      // Check for specific error cases
      if (errorData.details?.[0]?.issue === 'ORDER_ALREADY_CAPTURED') {
        // Order was already captured, treat as success
        return {
          success: true,
          alreadyCaptured: true,
          paypalOrderId,
        };
      }

      throw new Error(errorData.message || 'Failed to capture PayPal payment');
    }

    const captureData = await response.json();

    // Extract WooCommerce order info from the response
    const purchaseUnit = captureData.purchase_units?.[0];
    const orderId = purchaseUnit?.reference_id;
    const orderKey = purchaseUnit?.custom_id;

    // Get capture details
    const capture = purchaseUnit?.payments?.captures?.[0];

    console.log('[PayPal] Order captured:', paypalOrderId, 'Status:', captureData.status);

    return {
      success: true,
      paypalOrderId: captureData.id,
      status: captureData.status,
      orderId,
      orderKey,
      captureId: capture?.id,
      amount: capture?.amount?.value,
      currency: capture?.amount?.currency_code,
      payerEmail: captureData.payer?.email_address,
      payerName: captureData.payer?.name?.given_name,
    };
  } catch (error) {
    console.error('[PayPal] Failed to capture order:', error.message);
    throw new Error(error.message || 'Failed to capture PayPal payment');
  }
};

/**
 * Get PayPal order details
 * @param {string} paypalOrderId - The PayPal order ID
 * @returns {Promise<Object>} Order details
 */
export const getPayPalOrder = async (paypalOrderId) => {
  try {
    const accessToken = await getAccessToken();

    const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${paypalOrderId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[PayPal] Failed to get order:', errorData);
      throw new Error(errorData.message || 'Failed to get PayPal order details');
    }

    const orderData = await response.json();

    const purchaseUnit = orderData.purchase_units?.[0];

    return {
      success: true,
      paypalOrderId: orderData.id,
      status: orderData.status,
      orderId: purchaseUnit?.reference_id,
      orderKey: purchaseUnit?.custom_id,
      amount: purchaseUnit?.amount?.value,
      currency: purchaseUnit?.amount?.currency_code,
    };
  } catch (error) {
    console.error('[PayPal] Failed to get order:', error.message);
    throw new Error(error.message || 'Failed to get PayPal order details');
  }
};

/**
 * Verify webhook signature (for PayPal webhooks)
 * @param {Object} headers - Request headers
 * @param {string} body - Raw request body
 * @param {string} webhookId - PayPal webhook ID
 * @returns {Promise<boolean>} Whether signature is valid
 */
export const verifyWebhookSignature = async (headers, body, webhookId) => {
  try {
    const accessToken = await getAccessToken();

    const verificationData = {
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: JSON.parse(body),
    };

    const response = await fetch(`${PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(verificationData),
    });

    if (!response.ok) {
      console.error('[PayPal] Webhook verification failed');
      return false;
    }

    const result = await response.json();
    return result.verification_status === 'SUCCESS';
  } catch (error) {
    console.error('[PayPal] Webhook verification error:', error.message);
    return false;
  }
};

/**
 * Get PayPal client ID for frontend
 * @returns {string} PayPal client ID
 */
export const getClientId = () => {
  return PAYPAL_CLIENT_ID;
};

/**
 * Get PayPal merchant ID
 * @returns {string} PayPal merchant ID
 */
export const getMerchantId = () => {
  return PAYPAL_MERCHANT_ID;
};

export default {
  createPayPalOrder,
  capturePayPalOrder,
  getPayPalOrder,
  verifyWebhookSignature,
  getClientId,
  getMerchantId,
};
