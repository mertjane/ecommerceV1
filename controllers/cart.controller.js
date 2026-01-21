import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  applyCoupon,
  removeCoupon,
  getCartTotals,
} from "../services/cart.service.js";
import { successResponse, handleError } from "../utils/response.js";

/**
 * Extract cart token from request headers
 * The cart token is sent via X-Cart-Token header
 */
const getCartToken = (req) => {
  return req.headers["x-cart-token"] || null;
};

/**
 * Get cart
 * GET /api/cart
 */
export const getCartHandler = async (req, res) => {
  try {
    const cartToken = getCartToken(req);
    const result = await getCart(cartToken);

    // Set cart token in response header for client to store
    if (result.cartToken) {
      res.setHeader("X-Cart-Token", result.cartToken);
    }

    return successResponse(
      res,
      {
        cart: result.cart,
        cartHash: result.cartHash,
      },
      "Cart retrieved successfully",
    );
  } catch (error) {
    return handleError(
      res,
      error.message || "Failed to get cart",
      error.status || 500,
    );
  }
};

/**
 * Add item to cart
 * POST /api/cart/add
 * Body: { productId, quantity, variation? }
 */
export const addToCartHandler = async (req, res) => {
  try {
    const cartToken = getCartToken(req);
    const {
      productId,
      quantity = 1,
      sqm,
      variationId,
      variation = [],
    } = req.body;

    if (!productId) {
      return handleError(res, "Product ID is required", 400);
    }

    const result = await addToCart(
      productId,
      quantity,
      sqm,
      variation,
      cartToken,
      variationId,
    );

    // Set cart token in response header
    if (result.cartToken) {
      res.setHeader("X-Cart-Token", result.cartToken);
    }

    return successResponse(
      res,
      {
        cart: result.cart,
        cartHash: result.cartHash,
      },
      "Item added to cart",
    );
  } catch (error) {
    return handleError(
      res,
      error.message || "Failed to add item to cart",
      error.status || 500,
    );
  }
};

/**
 * Update cart item quantity
 * PUT /api/cart/item/:key
 * Body: { quantity }
 */
export const updateCartItemHandler = async (req, res) => {
  try {
    const cartToken = getCartToken(req);
    const { key } = req.params;
    const { quantity, sqm } = req.body;

    if (!cartToken) {
      return handleError(res, "Cart session required", 400);
    }

    if (!key) {
      return handleError(res, "Item key is required", 400);
    }

    if (quantity === undefined || quantity < 0) {
      return handleError(res, "Valid quantity is required", 400);
    }

    // If quantity is 0, remove the item instead
    if (quantity === 0) {
      const result = await removeFromCart(key, cartToken);

      if (result.cartToken) {
        res.setHeader("X-Cart-Token", result.cartToken);
      }

      return successResponse(
        res,
        {
          cart: result.cart,
          cartHash: result.cartHash,
        },
        "Item removed from cart",
      );
    }

    const result = await updateCartItem(key, quantity, sqm, cartToken);

    if (result.cartToken) {
      res.setHeader("X-Cart-Token", result.cartToken);
    }

    return successResponse(
      res,
      {
        cart: result.cart,
        cartHash: result.cartHash,
      },
      "Cart item updated",
    );
  } catch (error) {
    return handleError(
      res,
      error.message || "Failed to update cart item",
      error.status || 500,
    );
  }
};

/**
 * Remove item from cart
 * DELETE /api/cart/item/:key
 */
export const removeFromCartHandler = async (req, res) => {
  try {
    const cartToken = getCartToken(req);
    const { key } = req.params;

    if (!cartToken) {
      return handleError(res, "Cart session required", 400);
    }

    if (!key) {
      return handleError(res, "Item key is required", 400);
    }

    const result = await removeFromCart(key, cartToken);

    if (result.cartToken) {
      res.setHeader("X-Cart-Token", result.cartToken);
    }

    return successResponse(
      res,
      {
        cart: result.cart,
        cartHash: result.cartHash,
      },
      "Item removed from cart",
    );
  } catch (error) {
    return handleError(
      res,
      error.message || "Failed to remove item from cart",
      error.status || 500,
    );
  }
};

/**
 * Clear entire cart
 * DELETE /api/cart
 */
export const clearCartHandler = async (req, res) => {
  try {
    const cartToken = getCartToken(req);

    if (!cartToken) {
      return handleError(res, "Cart session required", 400);
    }

    const result = await clearCart(cartToken);

    if (result.cartToken) {
      res.setHeader("X-Cart-Token", result.cartToken);
    }

    return successResponse(
      res,
      {
        cart: result.cart,
        cartHash: result.cartHash,
      },
      "Cart cleared",
    );
  } catch (error) {
    return handleError(
      res,
      error.message || "Failed to clear cart",
      error.status || 500,
    );
  }
};

/**
 * Apply coupon to cart
 * POST /api/cart/coupon
 * Body: { code }
 */
export const applyCouponHandler = async (req, res) => {
  try {
    const cartToken = getCartToken(req);
    const { code } = req.body;

    if (!cartToken) {
      return handleError(res, "Cart session required", 400);
    }

    if (!code) {
      return handleError(res, "Coupon code is required", 400);
    }

    const result = await applyCoupon(code, cartToken);

    if (result.cartToken) {
      res.setHeader("X-Cart-Token", result.cartToken);
    }

    return successResponse(
      res,
      {
        cart: result.cart,
        cartHash: result.cartHash,
      },
      "Coupon applied successfully",
    );
  } catch (error) {
    // Handle specific coupon errors
    if (error.code === "woocommerce_rest_cart_coupon_error") {
      return handleError(res, error.message || "Invalid coupon", 400);
    }
    return handleError(
      res,
      error.message || "Failed to apply coupon",
      error.status || 500,
    );
  }
};

/**
 * Remove coupon from cart
 * DELETE /api/cart/coupon/:code
 */
export const removeCouponHandler = async (req, res) => {
  try {
    const cartToken = getCartToken(req);
    const { code } = req.params;

    if (!cartToken) {
      return handleError(res, "Cart session required", 400);
    }

    if (!code) {
      return handleError(res, "Coupon code is required", 400);
    }

    const result = await removeCoupon(code, cartToken);

    if (result.cartToken) {
      res.setHeader("X-Cart-Token", result.cartToken);
    }

    return successResponse(
      res,
      {
        cart: result.cart,
        cartHash: result.cartHash,
      },
      "Coupon removed successfully",
    );
  } catch (error) {
    return handleError(
      res,
      error.message || "Failed to remove coupon",
      error.status || 500,
    );
  }
};

/**
 * Get cart totals summary
 * GET /api/cart/totals
 */
export const getCartTotalsHandler = async (req, res) => {
  try {
    const cartToken = getCartToken(req);

    if (!cartToken) {
      return handleError(res, "Cart session required", 400);
    }

    const totals = await getCartTotals(cartToken);

    return successResponse(res, totals, "Cart totals retrieved");
  } catch (error) {
    return handleError(
      res,
      error.message || "Failed to get cart totals",
      error.status || 500,
    );
  }
};
