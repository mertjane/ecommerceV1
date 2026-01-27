import crypto from "crypto";
import wcApi from "../config/woocommerce.js";
import { fetchProductVariations } from "./variations.service.js";

/**
 * Server-side Cart Storage
 * Carts are stored in memory with session tokens
 * Each cart is isolated by its unique cart token
 */

// In-memory cart storage (can be replaced with Redis for production)
const cartStorage = new Map();

// Cart expiration time (24 hours)
const CART_EXPIRATION_MS = 24 * 60 * 60 * 1000;

/**
 * Generate a unique cart token
 */
export const generateCartToken = () => {
  return crypto.randomBytes(32).toString("base64url");
};

/**
 * Generate cart hash from cart contents for validation
 */
const generateCartHash = (cart) => {
  const cartString = JSON.stringify(cart.items || []);
  return crypto.createHash("md5").update(cartString).digest("hex");
};

/**
 * Clean up expired carts periodically
 */
const cleanupExpiredCarts = () => {
  const now = Date.now();
  for (const [token, cart] of cartStorage.entries()) {
    if (now - cart.updatedAt > CART_EXPIRATION_MS) {
      cartStorage.delete(token);
    }
  }
};

// Run cleanup every hour
setInterval(cleanupExpiredCarts, 60 * 60 * 1000);

/**
 * Create empty cart structure
 */
const createEmptyCart = (cartToken) => {
  return {
    cartToken,
    items: [],
    coupons: [],
    totals: {
      subtotal: "0",
      discount: "0",
      shipping: "0",
      tax: "0",
      total: "0",
      currency: "GBP",
      currencySymbol: "£",
    },
    itemsCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
};

/**
 * Get or create cart by token
 */
const getOrCreateCart = (cartToken) => {
  if (!cartToken) {
    const newToken = generateCartToken();
    const newCart = createEmptyCart(newToken);
    cartStorage.set(newToken, newCart);
    return newCart;
  }

  let cart = cartStorage.get(cartToken);
  if (!cart) {
    cart = createEmptyCart(cartToken);
    cartStorage.set(cartToken, cart);
  }

  return cart;
};

/**
 * Fetch product details from WooCommerce
 */
const fetchProduct = async (productId) => {
  try {
    const { data: product } = await wcApi.get(`products/${productId}`);
    return product;
  } catch (error) {
    console.error(`Failed to fetch product ${productId}:`, error.message);
    throw new Error("Product not found");
  }
};

/**
 * Calculate cart totals
 */
const calculateTotals = (cart) => {
  let subtotal = 0;

  for (const item of cart.items) {
    subtotal += parseFloat(item.lineTotal);
  }

  // Apply coupon discounts (simplified - real implementation would validate coupons)
  let discount = 0;
  for (const coupon of cart.coupons) {
    if (coupon.discountType === "percent") {
      discount += subtotal * (coupon.amount / 100);
    } else {
      discount += coupon.amount;
    }
  }

  const total = Math.max(0, subtotal - discount);

  cart.totals = {
    subtotal: subtotal.toFixed(2),
    discount: discount.toFixed(2),
    shipping: "0.00", // Will be calculated at checkout
    tax: "0.00", // Will be calculated at checkout
    total: total.toFixed(2),
    currency: "GBP",
    currencySymbol: "£",
  };

  cart.itemsCount = cart.items.reduce((count, item) => count + item.quantity, 0);
  cart.updatedAt = Date.now();

  return cart;
};

/**
 * Generate unique item key
 */
const generateItemKey = (productId, variationId, variation) => {
  const data = `${productId}-${variationId || 0}-${JSON.stringify(variation || [])}`;
  return crypto.createHash("md5").update(data).digest("hex").substring(0, 16);
};

/**
 * Get cart contents
 */
export const getCart = async (cartToken = null) => {
  const cart = getOrCreateCart(cartToken);

  return {
    cart: formatCartResponse(cart),
    cartToken: cart.cartToken,
    cartHash: generateCartHash(cart),
  };
};

/**
 * Add item to cart
 */
export const addToCart = async (
  productId, 
  quantity = 1, 
  sqm = 0, 
  variation = [], 
  cartToken = null, 
  variationId = null
) => {
  const cart = getOrCreateCart(cartToken);
  
  // 1. Always fetch parent product first for basic details (Name, Slug, etc.)
  const product = await fetchProduct(productId);

  if (product.status !== "publish") throw new Error("Product is not available");
  // Note: Parent stock status might be "instock" even if a specific variation is out.
  // We should check specific variation stock later if needed.
  if (product.stock_status === "outofstock") throw new Error("Product is out of stock");

  // 2. Determine Price, Weight, and Shipping Class
  let price = 0;
  
  let finalVariationId = variationId;
  let productImage = product.images?.[0]?.src || "";
  let variationName = ""; // Store variation name for display in cart
  let isSample = false; // Flag to identify sample items

  // Shipping-related fields - start with parent product values as defaults
  let itemWeight = parseFloat(product.weight) || 0;
  let itemShippingClassId = product.shipping_class_id || 0;
  let itemShippingClass = product.shipping_class || "";

  // 2A. If a specific Variation ID is provided, fetch IT specifically
  if (variationId) {
    try {
      // Fetch the specific variation data from WooCommerce
      const { data: variationData } = await wcApi.get(`products/${productId}/variations/${variationId}`);

      if (variationData) {
        // Get the accurate price for this specific size/finish
        price = parseFloat(variationData.sale_price || variationData.price || variationData.regular_price || 0);

        // Optional: Update image if the variation has its own specific image
        if (variationData.image && variationData.image.src) {
          productImage = variationData.image.src;
        }

        // Get weight from variation (override parent if variation has its own weight)
        if (variationData.weight && parseFloat(variationData.weight) > 0) {
          itemWeight = parseFloat(variationData.weight);
        }

        // Get shipping class from variation (override parent if variation has its own)
        if (variationData.shipping_class_id) {
          itemShippingClassId = variationData.shipping_class_id;
          itemShippingClass = variationData.shipping_class || "";
        }

        // Build variation name from attributes (e.g., "Free Sample (100x100)")
        if (variationData.attributes && variationData.attributes.length > 0) {
          variationName = variationData.attributes
            .map(attr => attr.option)
            .join(' - ');
        }

        // Check if this is a sample variation (free or full size)
        const sku = (variationData.sku || "").toLowerCase();
        const attrOptions = (variationData.attributes || [])
          .map(attr => (attr.option || "").toLowerCase())
          .join(" ");
        isSample = sku.includes("sample") || attrOptions.includes("sample");
      }
    } catch (error) {
      console.warn(`Failed to fetch specific variation ${variationId}:`, error.message);
      // Don't throw here; allow fallback to parent price logic if fetch fails
    }
  }

 

  // 3. Generate Key
  // IMPORTANT: We pass finalVariationId here so "60x60" is treated differently than "30x30"
  const itemKey = generateItemKey(productId, finalVariationId, variation);
  
  const existingItemIndex = cart.items.findIndex((item) => item.key === itemKey);

  // 4. Helper to calculate total based on SQM or Quantity
  const calculateItemTotal = (p, q, s) => {
    // If SQM is > 0, use it. Otherwise use Quantity.
    const multiplier = s > 0 ? s : q;
    return (multiplier * p).toFixed(2);
  };

  if (existingItemIndex > -1) {
    // UPDATE EXISTING ITEM
    cart.items[existingItemIndex].quantity += quantity;
    
    // Update SQM
    const currentSqm = cart.items[existingItemIndex].sqm || 0;
    const newSqmTotal = currentSqm + sqm;
    cart.items[existingItemIndex].sqm = Number(newSqmTotal.toFixed(2));

    // Recalculate Total
    cart.items[existingItemIndex].lineTotal = calculateItemTotal(
      cart.items[existingItemIndex].price,
      cart.items[existingItemIndex].quantity,
      cart.items[existingItemIndex].sqm
    );
  } else {
    // ADD NEW ITEM
    const newItem = {
      key: itemKey,
      productId: product.id,
      name: product.name,
      slug: product.slug,
      sku: product.sku || "", // You could update this with variation SKU if available
      quantity,
      sqm: sqm || 0,
      price: price.toFixed(2),
      lineTotal: calculateItemTotal(price, quantity, sqm || 0),
      image: productImage,
      variation: variation || [],
      variationId: finalVariationId, // Store the ID for reference
      variationName, // e.g., "Free Sample (100x100)" or "Full Size Sample"
      isSample, // true for sample variations (free or full size)
      stockStatus: product.stock_status,
      stockQuantity: product.stock_quantity,
      permalink: product.permalink,
      // Shipping-related fields for accurate shipping calculation
      weight: itemWeight,
      shippingClassId: itemShippingClassId,
      shippingClass: itemShippingClass,
    };
    cart.items.push(newItem);
  }

  // 5. Finalize
  calculateTotals(cart);
  cartStorage.set(cart.cartToken, cart);

  return {
    cart: formatCartResponse(cart),
    cartToken: cart.cartToken,
    cartHash: generateCartHash(cart),
  };
};

/**
 * Update cart item quantity
 */
export const updateCartItem = async (itemKey, quantity, sqm, cartToken) => {
  if (!cartToken) throw new Error("Cart session required");
  
  const cart = cartStorage.get(cartToken);
  if (!cart) throw new Error("Cart not found");

  const itemIndex = cart.items.findIndex((item) => item.key === itemKey);
  if (itemIndex === -1) throw new Error("Item not found in cart");

  if (quantity <= 0) {
    cart.items.splice(itemIndex, 1);
  } else {
    // Update values
    cart.items[itemIndex].quantity = quantity;
    if (sqm !== undefined) {
      cart.items[itemIndex].sqm = Number(sqm); // ✅ Update SQM
    }

    // Recalculate Line Total
    const item = cart.items[itemIndex];
    const multiplier = item.sqm > 0 ? item.sqm : item.quantity; // ✅ Use SQM if tile
    item.lineTotal = (multiplier * parseFloat(item.price)).toFixed(2);
  }

  calculateTotals(cart);
  cartStorage.set(cartToken, cart);

  return {
    cart: formatCartResponse(cart),
    cartToken: cart.cartToken,
    cartHash: generateCartHash(cart),
  };
};

/**
 * Remove item from cart
 */
export const removeFromCart = async (itemKey, cartToken) => {
  if (!cartToken) {
    throw new Error("Cart session required");
  }

  const cart = cartStorage.get(cartToken);
  if (!cart) {
    throw new Error("Cart not found");
  }

  const itemIndex = cart.items.findIndex((item) => item.key === itemKey);
  if (itemIndex === -1) {
    throw new Error("Item not found in cart");
  }

  cart.items.splice(itemIndex, 1);

  // Recalculate totals
  calculateTotals(cart);

  // Save to storage
  cartStorage.set(cartToken, cart);

  return {
    cart: formatCartResponse(cart),
    cartToken: cart.cartToken,
    cartHash: generateCartHash(cart),
  };
};

/**
 * Clear entire cart
 */
export const clearCart = async (cartToken) => {
  if (!cartToken) {
    throw new Error("Cart session required");
  }

  const cart = cartStorage.get(cartToken);
  if (!cart) {
    throw new Error("Cart not found");
  }

  cart.items = [];
  cart.coupons = [];

  // Recalculate totals
  calculateTotals(cart);

  // Save to storage
  cartStorage.set(cartToken, cart);

  return {
    cart: formatCartResponse(cart),
    cartToken: cart.cartToken,
    cartHash: generateCartHash(cart),
  };
};

/**
 * Apply coupon to cart
 */
export const applyCoupon = async (couponCode, cartToken) => {
  if (!cartToken) {
    throw new Error("Cart session required");
  }

  const cart = cartStorage.get(cartToken);
  if (!cart) {
    throw new Error("Cart not found");
  }

  // Check if coupon already applied
  if (cart.coupons.some((c) => c.code.toLowerCase() === couponCode.toLowerCase())) {
    throw new Error("Coupon already applied");
  }

  // Validate coupon with WooCommerce
  try {
    const { data: coupons } = await wcApi.get("coupons", { code: couponCode });

    if (!coupons || coupons.length === 0) {
      throw new Error("Invalid coupon code");
    }

    const coupon = coupons[0];

    // Check if coupon is valid
    if (coupon.date_expires && new Date(coupon.date_expires) < new Date()) {
      throw new Error("Coupon has expired");
    }

    // Add coupon to cart
    cart.coupons.push({
      code: coupon.code,
      discountType: coupon.discount_type,
      amount: parseFloat(coupon.amount),
      description: coupon.description,
    });

    // Recalculate totals
    calculateTotals(cart);

    // Save to storage
    cartStorage.set(cartToken, cart);

    return {
      cart: formatCartResponse(cart),
      cartToken: cart.cartToken,
      cartHash: generateCartHash(cart),
    };
  } catch (error) {
    if (error.message.includes("Invalid") || error.message.includes("expired")) {
      throw error;
    }
    throw new Error("Failed to validate coupon");
  }
};

/**
 * Remove coupon from cart
 */
export const removeCoupon = async (couponCode, cartToken) => {
  if (!cartToken) {
    throw new Error("Cart session required");
  }

  const cart = cartStorage.get(cartToken);
  if (!cart) {
    throw new Error("Cart not found");
  }

  const couponIndex = cart.coupons.findIndex(
    (c) => c.code.toLowerCase() === couponCode.toLowerCase()
  );

  if (couponIndex === -1) {
    throw new Error("Coupon not found in cart");
  }

  cart.coupons.splice(couponIndex, 1);

  // Recalculate totals
  calculateTotals(cart);

  // Save to storage
  cartStorage.set(cartToken, cart);

  return {
    cart: formatCartResponse(cart),
    cartToken: cart.cartToken,
    cartHash: generateCartHash(cart),
  };
};

/**
 * Get cart totals
 */
export const getCartTotals = async (cartToken) => {
  if (!cartToken) {
    throw new Error("Cart session required");
  }

  const cart = cartStorage.get(cartToken);
  if (!cart) {
    throw new Error("Cart not found");
  }

  return {
    itemsCount: cart.itemsCount,
    totals: cart.totals,
    coupons: cart.coupons,
  };
};

/**
 * Format cart for API response
 */
const formatCartResponse = (cart) => {
  return {
    items: cart.items,
    coupons: cart.coupons,
    totals: cart.totals,
    itemsCount: cart.itemsCount,
  };
};

/**
 * Get cart for checkout (returns full cart data for order creation)
 */
export const getCartForCheckout = async (cartToken) => {
  if (!cartToken) {
    throw new Error("Cart session required");
  }

  const cart = cartStorage.get(cartToken);
  if (!cart) {
    throw new Error("Cart not found");
  }

  if (cart.items.length === 0) {
    throw new Error("Cart is empty");
  }

  return cart;
};

/**
 * Delete cart after successful checkout
 */
export const deleteCart = (cartToken) => {
  if (cartToken) {
    cartStorage.delete(cartToken);
  }
};
