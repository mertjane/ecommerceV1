import redis from "../config/redis.js";

const CONDITIONAL_SHIPPING_CACHE_TTL = 60 * 60; // 1 hour
const WP_API_URL = process.env.WP_URL || "https://karakedi.xyz";
const WP_API_KEY = process.env.WC_CONSUMER_SECRET;

/**
 * Fetch conditional shipping rules from WordPress
 */
export const getConditionalShippingRules = async () => {
  try {
    // Try cache first
    const cached = await redis.get("conditional:shipping:rules");
    if (cached) {
      return JSON.parse(cached);
    }

    const response = await fetch(
      `${WP_API_URL}/wp-json/custom/v1/conditional-shipping-rules?api_key=${WP_API_KEY}`
    );

    if (!response.ok) {
      console.error("Failed to fetch conditional shipping rules:", response.status);
      return [];
    }

    const data = await response.json();
    const rules = data.rules || [];

    // Cache the result
    await redis.setex(
      "conditional:shipping:rules",
      CONDITIONAL_SHIPPING_CACHE_TTL,
      JSON.stringify(rules)
    );

    return rules;
  } catch (error) {
    console.error("Error fetching conditional shipping rules:", error.message);
    return [];
  }
};

/**
 * Normalize shipping method title for comparison
 * Handles variations like "2-3 Days" vs "2 - 3 Days"
 */
const normalizeMethodTitle = (title) => {
  return title
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s*to\s*/g, "-")
    .replace(/:/g, ".")
    .trim();
};

/**
 * Check if a shipping method title matches any in the list
 */
const isMethodInList = (methodTitle, methodList) => {
  const normalizedTitle = normalizeMethodTitle(methodTitle);

  for (const listItem of methodList) {
    const normalizedItem = normalizeMethodTitle(listItem);
    if (normalizedTitle === normalizedItem) {
      return true;
    }
  }
  return false;
};

/**
 * Apply conditional shipping rules to filter out disabled methods
 *
 * @param {Array} methods - Available shipping methods
 * @param {Array} cartItems - Items in the cart with productId
 * @returns {Array} Filtered shipping methods
 */
// Free sample shipping methods - only these should show for free sample carts
const FREE_SAMPLE_ALLOWED_METHODS = [
  "Collection: Free",
  "Economy Delivery (2-3 Days)",
];

// Free sample shipping pricing
const FREE_SAMPLE_MAX_QTY = 4; // Maximum 4 free samples allowed in cart
const FREE_SAMPLE_CHARGE_THRESHOLD = 3; // If qty > 3, add shipping charge
const FREE_SAMPLE_SHIPPING_CHARGE = 7.5; // £7.50 flat charge when qty = 4

export const applyConditionalShippingRules = async (methods, cartItems) => {
  try {
    // Check if cart contains ONLY free samples (all items have price = 0)
    const allFreeSamples = cartItems.length > 0 && cartItems.every(item => {
      const price = parseFloat(item.price || 0);
      return price === 0;
    });

    // If all items are free samples, only show allowed methods
    if (allFreeSamples) {
      // Calculate total quantity of free samples
      const totalFreeSampleQty = cartItems.reduce((sum, item) => {
        return sum + (parseInt(item.quantity, 10) || 1);
      }, 0);

      if (process.env.NODE_ENV !== "production") {
        console.log(`[Conditional Shipping] Cart contains ONLY free samples (qty: ${totalFreeSampleQty}) - restricting to free sample methods`);
      }

      // Filter to only allowed methods and adjust Economy Delivery cost if qty > 4
      const filteredMethods = methods
        .filter((method) => isMethodInList(method.title, FREE_SAMPLE_ALLOWED_METHODS))
        .map((method) => {
          // Check if this is Economy Delivery and qty exceeds free limit
          const isEconomyDelivery = normalizeMethodTitle(method.title).includes("economy");

          if (isEconomyDelivery && totalFreeSampleQty > FREE_SAMPLE_CHARGE_THRESHOLD) {
            if (process.env.NODE_ENV !== "production") {
              console.log(`[Conditional Shipping] Free samples qty ${totalFreeSampleQty} > ${FREE_SAMPLE_CHARGE_THRESHOLD}, adding £${FREE_SAMPLE_SHIPPING_CHARGE} to Economy Delivery`);
            }

            return {
              ...method,
              cost: (parseFloat(method.cost) || 0) + FREE_SAMPLE_SHIPPING_CHARGE,
            };
          }
          return method;
        });

      if (process.env.NODE_ENV !== "production") {
        console.log(`[Conditional Shipping] Free sample methods: ${methods.length} -> ${filteredMethods.length}`);
      }
      return filteredMethods;
    }

    const rules = await getConditionalShippingRules();

    if (!rules.length) {
      return methods;
    }

    // Get all product IDs in the cart (including parent product IDs)
    const cartProductIds = new Set();
    for (const item of cartItems) {
      if (item.productId) cartProductIds.add(String(item.productId));
      if (item.parentProductId) cartProductIds.add(String(item.parentProductId));
    }

    // Collect methods to disable and enable based on rules
    const disabledMethodNames = new Set();
    const enabledMethodNames = new Set();
    let hasEnableRule = false;

    for (const rule of rules) {
      if (!rule.enabled) continue;

      // Check if rule conditions are met
      let ruleMatches = false;

      for (const condition of rule.conditions) {
        if (condition.type === "products") {
          const ruleProductIds = condition.product_ids || [];
          const operator = condition.operator;

          if (operator === "in") {
            // Condition: if ANY of these products are in cart, apply rule
            ruleMatches = ruleProductIds.some((pid) => cartProductIds.has(pid));
          } else if (operator === "notin") {
            // Condition: if NONE of these products are in cart, apply rule
            ruleMatches = !ruleProductIds.some((pid) => cartProductIds.has(pid));
          }
        }
      }

      // If conditions match, collect disabled/enabled methods
      if (ruleMatches) {
        if (process.env.NODE_ENV !== "production") {
          console.log(`[Conditional Shipping] Rule #${rule.id} "${rule.title}" MATCHED`);
        }
        for (const action of rule.actions) {
          if (action.type === "disable_shipping_methods") {
            for (const methodName of action.disabled_methods || []) {
              disabledMethodNames.add(methodName);
            }
          } else if (action.type === "enable_shipping_methods") {
            hasEnableRule = true;
            for (const methodName of action.enabled_methods || []) {
              enabledMethodNames.add(methodName);
            }
          }
        }
      }
    }

    let filteredMethods = methods;

    // If enable rules matched, ONLY show enabled methods and SKIP disable rules
    // Enable rules take precedence over all disable rules
    if (hasEnableRule && enabledMethodNames.size > 0) {
      filteredMethods = filteredMethods.filter((method) => {
        return isMethodInList(method.title, Array.from(enabledMethodNames));
      });
    } else if (disabledMethodNames.size > 0) {
      // Only apply disable rules if no enable rules matched
      filteredMethods = filteredMethods.filter((method) => {
        return !isMethodInList(method.title, Array.from(disabledMethodNames));
      });
    }

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[Conditional Shipping] Cart products: [${Array.from(cartProductIds).join(", ")}]`
      );
      console.log(
        `[Conditional Shipping] Available methods: [${methods.map(m => m.title).join(", ")}]`
      );
      if (enabledMethodNames.size > 0) {
        console.log(
          `[Conditional Shipping] Enabled methods: [${Array.from(enabledMethodNames).join(", ")}]`
        );
      }
      if (disabledMethodNames.size > 0) {
        console.log(
          `[Conditional Shipping] Disabled methods: [${Array.from(disabledMethodNames).join(", ")}]`
        );
      }
      console.log(
        `[Conditional Shipping] Methods: ${methods.length} -> ${filteredMethods.length}`
      );
    }

    return filteredMethods;
  } catch (error) {
    console.error("Error applying conditional shipping rules:", error.message);
    return methods;
  }
};

/**
 * Clear conditional shipping cache
 */
export const clearConditionalShippingCache = async () => {
  try {
    await redis.del("conditional:shipping:rules");
    return true;
  } catch (error) {
    console.error("Failed to clear conditional shipping cache:", error.message);
    return false;
  }
};