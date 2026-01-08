import wcApi from "../config/woocommerce.js";
import jwt from "jsonwebtoken";

// Token expiration: 5 days as requested
const TOKEN_EXPIRATION = "5d";

/**
 * Register a new customer
 */
export const registerCustomer = async (email, password) => {
  try {
    // Check if user already exists
    const { data: existingUsers } = await wcApi.get("customers", {
      email,
      per_page: 1,
    });

    if (existingUsers.length > 0) {
      throw new Error("Email already in use");
    }

    // Create new customer
    const customerData = {
      email,
      password,
      username: email, // WooCommerce requires username
      role: "customer",
    };

    const { data: newCustomer } = await wcApi.post("customers", customerData);

    // Generate JWT token with 5 days expiration
    const token = jwt.sign(
      {
        userId: newCustomer.id,
        email: newCustomer.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: TOKEN_EXPIRATION }
    );

    return {
      success: true,
      message: "Registration successful",
      customer: newCustomer,
      token,
    };
  } catch (error) {
    console.error("Registration error:", error);
    throw error;
  }
};

/**
 * Login customer with WordPress JWT authentication
 */
export const loginCustomer = async (email, password) => {
  try {
    // Find user by email
    const { data: customers } = await wcApi.get("customers", {
      email,
      per_page: 1,
    });

    if (customers.length === 0) {
      throw new Error("Invalid credentials");
    }

    const customer = customers[0];

    // Authenticate against WordPress REST API using JWT Auth plugin
    const wpAuthResponse = await fetch(
      `${process.env.WC_SITE_URL}/wp-json/jwt-auth/v1/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: email,
          password,
        }),
      }
    );

    const authData = await wpAuthResponse.json();

    if (!wpAuthResponse.ok) {
      throw new Error(authData.message || "Invalid credentials");
    }

    // Generate our own JWT token for the app (5 days expiration)
    const token = jwt.sign(
      {
        userId: customer.id,
        email: customer.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: TOKEN_EXPIRATION }
    );

    return {
      success: true,
      message: "Login successful",
      customer,
      token,
      wpToken: authData.token, // WordPress JWT token if needed
    };
  } catch (error) {
    console.error("Login error:", error);
    throw error;
  }
};

/**
 * Verify JWT token and get customer data
 */
export const verifyToken = async (token) => {
  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get customer from WooCommerce
    const { data: customer } = await wcApi.get(`customers/${decoded.userId}`);

    if (!customer) {
      throw new Error("User not found");
    }

    return {
      success: true,
      customer,
      token,
    };
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      throw new Error("Invalid or expired token");
    }
    throw error;
  }
};

/**
 * Refresh authentication token (extends session by 5 days)
 */
export const refreshToken = async (oldToken) => {
  try {
    // Decode the old token (even if expired)
    let decoded;
    try {
      decoded = jwt.verify(oldToken, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        decoded = jwt.decode(oldToken);
      } else {
        throw new Error("Invalid token");
      }
    }

    // Verify user still exists
    const { data: customer } = await wcApi.get(`customers/${decoded.userId}`);

    if (!customer) {
      throw new Error("User not found");
    }

    // Generate new token with 5 days expiration
    const newToken = jwt.sign(
      {
        userId: customer.id,
        email: customer.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: TOKEN_EXPIRATION }
    );

    return {
      success: true,
      message: "Token refreshed",
      token: newToken,
      customer,
    };
  } catch (error) {
    console.error("Token refresh error:", error);
    throw error;
  }
};

/**
 * Update customer profile
 */
export const updateCustomerProfile = async (customerId, updateData) => {
  try {
    const { data: updatedCustomer } = await wcApi.put(
      `customers/${customerId}`,
      updateData
    );

    return {
      success: true,
      message: "Profile updated successfully",
      customer: updatedCustomer,
    };
  } catch (error) {
    console.error("Update profile error:", error);
    throw error;
  }
};
