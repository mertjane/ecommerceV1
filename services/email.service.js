import axios from "axios";

const WC_SITE_URL = process.env.WC_SITE_URL;

/**
 * WordPress Custom API Client
 * Used for triggering WooCommerce emails via our custom plugin
 */
const wpCustomApi = axios.create({
  baseURL: `${WC_SITE_URL}/wp-json/custom/v1`,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Send order confirmation email via WordPress
 * This triggers the WooCommerce email based on order status
 *
 * @param {number|string} orderId - WooCommerce order ID
 * @returns {Promise<Object>} Result of email trigger
 */
export const sendOrderConfirmationEmail = async (orderId) => {
  try {
    console.log("[Email] Triggering order confirmation email for order:", orderId);

    const response = await wpCustomApi.post("/send-order-email", {
      order_id: orderId,
    });

    console.log("[Email] Order email sent successfully:", response.data);

    return {
      success: true,
      message: response.data.message,
      email: response.data.email,
      emailType: response.data.email_type,
    };
  } catch (error) {
    console.error(
      "[Email] Failed to send order email:",
      error.response?.data || error.message
    );

    // Don't throw - email failure shouldn't break the flow
    return {
      success: false,
      message: error.response?.data?.message || error.message,
    };
  }
};

/**
 * Send specific order email by type
 *
 * @param {number|string} orderId - WooCommerce order ID
 * @param {string} emailType - Type of email to send
 *   - 'processing': Customer order processing (payment received)
 *   - 'completed': Customer order completed
 *   - 'on_hold': Customer order on hold
 *   - 'cancelled': Customer order cancelled
 *   - 'refunded': Customer order refunded
 *   - 'new_order': Admin new order notification
 * @returns {Promise<Object>} Result of email trigger
 */
export const sendOrderEmail = async (orderId, emailType) => {
  try {
    console.log(`[Email] Triggering ${emailType} email for order:`, orderId);

    const response = await wpCustomApi.post(`/send-order-email/${emailType}`, {
      order_id: orderId,
    });

    console.log(`[Email] ${emailType} email sent successfully:`, response.data);

    return {
      success: true,
      message: response.data.message,
      recipient: response.data.recipient,
      emailType: response.data.email_type,
    };
  } catch (error) {
    console.error(
      `[Email] Failed to send ${emailType} email:`,
      error.response?.data || error.message
    );

    // Don't throw - email failure shouldn't break the flow
    return {
      success: false,
      message: error.response?.data?.message || error.message,
    };
  }
};

export default {
  sendOrderConfirmationEmail,
  sendOrderEmail,
};
