import wcApi from "../config/woocommerce.js";

/**
 * Get customer orders
 */
export const getCustomerOrders = async (customerId, page = 1, perPage = 10) => {
  try {
    const { data: orders } = await wcApi.get("orders", {
      customer: customerId,
      page,
      per_page: perPage,
      orderby: "date",
      order: "desc",
    });

    return orders;
  } catch (error) {
    console.error("Get orders error:", error);
    throw error;
  }
};

/**
 * Get single order
 */
export const getOrderById = async (orderId, customerId) => {
  try {
    const { data: order } = await wcApi.get(`orders/${orderId}`);

    // Verify the order belongs to the customer
    if (order.customer_id !== customerId) {
      throw new Error("Order not found");
    }

    return order;
  } catch (error) {
    console.error("Get order error:", error);
    throw error;
  }
};

/**
 * Update customer billing address
 */
export const updateBillingAddress = async (customerId, addressData) => {
  try {
    const { data: customer } = await wcApi.put(`customers/${customerId}`, {
      billing: addressData,
    });

    return customer;
  } catch (error) {
    console.error("Update billing address error:", error);
    throw error;
  }
};

/**
 * Update customer shipping address
 */
export const updateShippingAddress = async (customerId, addressData) => {
  try {
    const { data: customer } = await wcApi.put(`customers/${customerId}`, {
      shipping: addressData,
    });

    return customer;
  } catch (error) {
    console.error("Update shipping address error:", error);
    throw error;
  }
};

/**
 * Update customer profile
 */
export const updateProfile = async (customerId, profileData) => {
  try {
    // Don't allow updating sensitive fields through this method
    const allowedFields = ["first_name", "last_name", "email"];
    const updateData = {};

    for (const field of allowedFields) {
      if (profileData[field] !== undefined) {
        updateData[field] = profileData[field];
      }
    }

    const { data: customer } = await wcApi.put(
      `customers/${customerId}`,
      updateData
    );

    return customer;
  } catch (error) {
    console.error("Update profile error:", error);
    throw error;
  }
};

/**
 * Change customer password (requires WordPress authentication)
 */
export const changePassword = async (customerId, currentPassword, newPassword, wpSiteUrl) => {
  try {
    // First get the customer email
    const { data: customer } = await wcApi.get(`customers/${customerId}`);

    // Verify current password via WordPress JWT auth
    const authResponse = await fetch(
      `${wpSiteUrl}/wp-json/jwt-auth/v1/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: customer.email,
          password: currentPassword,
        }),
      }
    );

    if (!authResponse.ok) {
      throw new Error("Current password is incorrect");
    }

    // Update password through WooCommerce API
    await wcApi.put(`customers/${customerId}`, {
      password: newPassword,
    });

    return { success: true, message: "Password changed successfully" };
  } catch (error) {
    console.error("Change password error:", error);
    throw error;
  }
};
