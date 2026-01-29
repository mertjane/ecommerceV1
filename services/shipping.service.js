import wcApi from "../config/woocommerce.js";
import redis from "../config/redis.js";
import { applyConditionalShippingRules } from "./conditionalShipping.service.js";

// Cache TTL for shipping data (1 hour)
const SHIPPING_CACHE_TTL = 60 * 60;

/**
 * Get all shipping zones from WooCommerce
 */
export const getShippingZones = async () => {
  try {
    // Try cache first
    const cached = await redis.get("shipping:zones");
    if (cached) {
      return JSON.parse(cached);
    }

    const { data: zones } = await wcApi.get("shipping/zones");

    // Cache the result
    await redis.setex("shipping:zones", SHIPPING_CACHE_TTL, JSON.stringify(zones));

    return zones;
  } catch (error) {
    console.error("Failed to fetch shipping zones:", error.message);
    throw new Error("Failed to fetch shipping zones");
  }
};

/**
 * Get shipping methods for a specific zone
 */
export const getShippingMethodsForZone = async (zoneId) => {
  try {
    const cacheKey = `shipping:zone:${zoneId}:methods`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const { data: methods } = await wcApi.get(`shipping/zones/${zoneId}/methods`);

    // Only return enabled methods
    const enabledMethods = methods.filter((method) => method.enabled);

    // Cache the result
    await redis.setex(cacheKey, SHIPPING_CACHE_TTL, JSON.stringify(enabledMethods));

    return enabledMethods;
  } catch (error) {
    console.error(`Failed to fetch shipping methods for zone ${zoneId}:`, error.message);
    throw new Error("Failed to fetch shipping methods");
  }
};

/**
 * Get zone locations (countries/regions)
 */
export const getZoneLocations = async (zoneId) => {
  try {
    const cacheKey = `shipping:zone:${zoneId}:locations`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const { data: locations } = await wcApi.get(`shipping/zones/${zoneId}/locations`);

    // Cache the result
    await redis.setex(cacheKey, SHIPPING_CACHE_TTL, JSON.stringify(locations));

    return locations;
  } catch (error) {
    console.error(`Failed to fetch zone locations for zone ${zoneId}:`, error.message);
    throw new Error("Failed to fetch zone locations");
  }
};

/**
 * Find the appropriate shipping zone for a given address
 */
export const findZoneForAddress = async (country, postcode = "", state = "") => {
  try {
    const zones = await getShippingZones();

    // Sort zones by ID descending (higher IDs are more specific)
    // Zone 0 is "Locations not covered by your other zones"
    const sortedZones = zones.sort((a, b) => b.id - a.id);

    for (const zone of sortedZones) {
      // Skip zone 0 for now (fallback zone)
      if (zone.id === 0) continue;

      const locations = await getZoneLocations(zone.id);

      for (const location of locations) {
        // Check country match
        if (location.type === "country" && location.code === country) {
          return zone;
        }

        // Check state/region match (format: "country:state")
        if (location.type === "state") {
          const [locCountry, locState] = location.code.split(":");
          if (locCountry === country && locState === state) {
            return zone;
          }
        }

        // Check postcode match
        if (location.type === "postcode" && location.code === postcode) {
          return zone;
        }

        // Check continent match
        if (location.type === "continent") {
          // Would need a continent mapping here
          // For simplicity, skip continent matching for now
        }
      }
    }

    // Return zone 0 (fallback zone) if no specific zone matched
    const fallbackZone = zones.find((z) => z.id === 0);
    return fallbackZone || null;
  } catch (error) {
    console.error("Failed to find zone for address:", error.message);
    throw new Error("Failed to determine shipping zone");
  }
};


/**
 * Calculate shipping rates for given address and cart
 * Handles: Flat Rate, Free Shipping, Local Pickup, and Flexible Shipping
 */
export const calculateShippingRates = async (address, cartItems, cartSubtotal) => {
  try {
    const { country, postcode, state } = address;

    if (!country) throw new Error("Country is required");

    // 1. Calculate Total Weight
    const totalWeight = cartItems.reduce((total, item) => {
      return total + (parseFloat(item.weight || 0) * item.quantity);
    }, 0);

    // 2. Get all Shipping Class IDs present in the cart
    // We create a Set of IDs for easy lookup (e.g. ["moulding", "heavy"])
    const cartShippingClasses = cartItems.map(item => String(item.shippingClassId || ""));

    const zone = await findZoneForAddress(country, postcode, state);

    if (!zone) {
      return { zone: null, methods: [], message: "No shipping available" };
    }

    const methods = await getShippingMethodsForZone(zone.id);

    const rates = methods.map((method) => {
      let cost = 0;
      let label = method.title;
      let isAvailable = true; 

      switch (method.method_id) {
        
        // --- CASE 1: FLEXIBLE SHIPPING ---
        case "flexible_shipping_single":
          const rules = method.settings?.method_rules?.value || [];
          const calcMethod = method.settings?.method_calculation_method?.value || 'sum';

          // Get cart's shipping class IDs (filter out 0/empty)
          const cartClassIds = cartItems
            .map(item => String(item.shippingClassId || 0))
            .filter(id => id && id !== "0");

          // STEP 1: Collect ALL shipping class requirements from ALL rules
          // This helps us determine if this method is meant for specific shipping classes
          const methodRequiredClasses = new Set();

          // Check method-level shipping class restriction (some plugins use this)
          const methodShippingClass = method.settings?.method_shipping_class?.value;
          if (methodShippingClass && methodShippingClass !== "" && methodShippingClass !== "0") {
            methodRequiredClasses.add(String(methodShippingClass));
          }

          // Also check rule-level shipping class conditions
          for (const rule of rules) {
            if (rule.conditions) {
              for (const condition of rule.conditions) {
                if (condition.condition_id === 'shipping_class') {
                  const classes = Array.isArray(condition.value) ? condition.value : [condition.value];
                  classes.forEach(c => methodRequiredClasses.add(String(c)));
                }
              }
            }
          }

          // Debug: Log method info to help identify configuration issues
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[Shipping] Method: ${method.title}, Required Classes: [${[...methodRequiredClasses].join(', ')}], Cart Classes: [${cartClassIds.join(', ')}]`);
          }

          // STEP 2: If this method requires specific shipping classes,
          // check if cart has ANY items with those classes
          if (methodRequiredClasses.size > 0) {
            const cartHasRequiredClass = cartClassIds.some(classId =>
              methodRequiredClasses.has(classId)
            );

            // If cart doesn't have any of the required shipping classes, skip this method entirely
            if (!cartHasRequiredClass) {
              isAvailable = false;
              break;
            }
          }

          // STEP 2B: Fallback - Filter based on method title keywords
          // This handles cases where WooCommerce isn't configured with proper shipping_class conditions
          // but the method title indicates it's for a specific product type
          const methodTitleLower = method.title.toLowerCase();
          const specializedKeywords = [
            { keyword: 'moulding', shippingClasses: ['moulding'] },
            { keyword: 'ltp', shippingClasses: ['ltp'] },
            { keyword: 'jerusalem', shippingClasses: ['jerusalem'] },
            { keyword: 'vanity', shippingClasses: ['vanity', 'vanity-top', 'vanity_top'] },
            { keyword: 'brazilian', shippingClasses: ['brazilian'] },
            { keyword: 'slab', shippingClasses: ['slab', 'slabs'] },
          ];

          for (const { keyword, shippingClasses } of specializedKeywords) {
            if (methodTitleLower.includes(keyword)) {
              // This method is for a specialized product type
              // Check if cart has items with this shipping class
              const hasMatchingClass = cartItems.some(item => {
                const itemClass = (item.shippingClass || '').toLowerCase();
                const itemClassId = String(item.shippingClassId || 0);
                return shippingClasses.some(sc =>
                  itemClass.includes(sc) || itemClassId === sc
                );
              });

              if (!hasMatchingClass) {
                isAvailable = false;
                break;
              }
            }
          }

          if (!isAvailable) break;

          // STEP 3: Now evaluate rules normally
          let matchedCost = 0;
          let hasMatchingRule = false;
          let hasFreeRule = false;

          if (process.env.NODE_ENV !== 'production' && method.title.includes('2-3')) {
            console.log(`[Flexible Shipping] Evaluating "${method.title}" - Total Weight: ${totalWeight}kg, Rules: ${rules.length}`);
          }

          for (const rule of rules) {
            let ruleMatches = true;

            if (rule.conditions) {
              for (const condition of rule.conditions) {

                // A. Check Weight
                if (condition.condition_id === 'weight') {
                  const min = parseFloat(condition.min || 0);
                  const max = condition.max && condition.max !== "" ? parseFloat(condition.max) : Infinity;
                  if (totalWeight < min || totalWeight > max) {
                    ruleMatches = false;
                    break;
                  }
                }

                // B. Check Price
                if (condition.condition_id === 'price') {
                  const min = parseFloat(condition.min || 0);
                  const max = condition.max && condition.max !== "" ? parseFloat(condition.max) : Infinity;
                  if (parseFloat(cartSubtotal) < min || parseFloat(cartSubtotal) > max) {
                    ruleMatches = false;
                    break;
                  }
                }

                // C. Check Shipping Class
                if (condition.condition_id === 'shipping_class') {
                  const requiredClasses = Array.isArray(condition.value)
                    ? condition.value
                    : [condition.value];

                  const hasClass = cartItems.some(item =>
                    requiredClasses.includes(String(item.shippingClassId))
                  );

                  if (!hasClass) {
                    ruleMatches = false;
                    break;
                  }
                }
              }
            }

            if (ruleMatches) {
              hasMatchingRule = true;
              const ruleCost = parseFloat(rule.cost_per_order || 0);

              if (process.env.NODE_ENV !== 'production' && method.title.includes('2-3')) {
                console.log(`[Flexible Shipping] Rule matched for "${method.title}" - Cost: £${ruleCost}`);
              }

              if (ruleCost === 0) hasFreeRule = true;

              if (calcMethod === 'sum') matchedCost += ruleCost;
              else matchedCost = ruleCost;
            }
          }

          cost = matchedCost;

          // Hide if no rules matched
          // Allow FREE (cost 0) if explicitly matched a free rule
          if (!hasMatchingRule || (matchedCost === 0 && !hasFreeRule)) {
            isAvailable = false;
          }
          break;

        // --- CASE 2: FLAT RATE ---
        case "flat_rate":
          cost = parseFloat(method.settings?.cost?.value || 0);
          if (method.settings?.cost?.value?.includes("[qty]")) {
             // ... (keep existing logic) ...
             const basePattern = method.settings.cost.value;
             const totalQty = cartItems.reduce((sum, item) => sum + item.quantity, 0);
             const baseCost = parseFloat(basePattern.replace(/\[qty\].*/, "").trim()) || 0;
             const perItemCost = parseFloat(basePattern.match(/\[qty\]\s*\*\s*([\d.]+)/)?.[1]) || 0;
             cost = baseCost + (perItemCost * totalQty);
          }
          break;

        // --- CASE 3: FREE SHIPPING ---
        case "free_shipping":
          cost = 0;
          const minAmount = parseFloat(method.settings?.min_amount?.value || 0);
          if (minAmount > 0 && parseFloat(cartSubtotal) < minAmount) {
            isAvailable = false;
          }
          break;

        // --- CASE 4: LOCAL PICKUP ---
        case "local_pickup":
          cost = parseFloat(method.settings?.cost?.value || 0);
          break;

        default:
          cost = parseFloat(method.settings?.cost?.value || 0);
      }

      if (!isAvailable) return null;

      return {
        id: method.instance_id,
        methodId: method.method_id,
        title: label,
        description: method.settings?.method_description?.value || "",
        cost: cost.toFixed(2),
        taxable: method.settings?.tax_status?.value !== "none",
      };
    }).filter(Boolean);

    // STEP 4: Deduplicate methods with similar titles
    // Normalize titles to catch variations like "2 - 3 Days" vs "2-3 Days" vs "2 to 3 Days"
    const normalizeTitle = (title) => {
      return title
        .toLowerCase()
        .replace(/\s+/g, ' ')           // Normalize multiple spaces
        .replace(/\s*-\s*/g, '-')       // Normalize dashes: "2 - 3" -> "2-3"
        .replace(/\s*to\s*/g, '-')      // Convert "to" to dash: "2 to 3" -> "2-3"
        .replace(/:/g, '.')             // Normalize time: "12:00" -> "12.00"
        .trim();
    };

    const seenTitles = new Map(); // normalized title -> rate object
    const deduplicatedRates = [];

    for (const rate of rates) {
      const normalizedTitle = normalizeTitle(rate.title);

      if (!seenTitles.has(normalizedTitle)) {
        // First time seeing this title, keep it
        seenTitles.set(normalizedTitle, rate);
        deduplicatedRates.push(rate);
      } else {
        // Duplicate found - keep the one with lower cost (better for customer)
        const existingRate = seenTitles.get(normalizedTitle);
        const existingIndex = deduplicatedRates.indexOf(existingRate);

        if (parseFloat(rate.cost) < parseFloat(existingRate.cost)) {
          // New rate is cheaper, replace the existing one
          deduplicatedRates[existingIndex] = rate;
          seenTitles.set(normalizedTitle, rate);
        }
        // Otherwise keep the existing (cheaper or equal) rate
      }
    }

    // STEP 5: Apply conditional shipping rules from WP Trio plugin
    // This filters out methods based on product-specific conditions
    const finalMethods = await applyConditionalShippingRules(deduplicatedRates, cartItems);

    return {
      zone: { id: zone.id, name: zone.name },
      methods: finalMethods,
    };
  } catch (error) {
    console.error("Failed to calculate shipping rates:", error.message);
    throw new Error(error.message || "Failed to calculate shipping rates");
  }
};

/**
 * Get available shipping countries from WooCommerce settings
 */
export const getShippingCountries = async () => {
  try {
    const cached = await redis.get("shipping:countries");
    if (cached) {
      return JSON.parse(cached);
    }

    // Get allowed countries from WooCommerce settings
    const { data: settings } = await wcApi.get("settings/general");

    // Find shipping locations settings
    const shippingCountries = settings.find(
      (s) => s.id === "woocommerce_specific_allowed_countries"
    );
    const allowedCountries = settings.find(
      (s) => s.id === "woocommerce_allowed_countries"
    );

    let countries = [];

    if (allowedCountries?.value === "specific" && shippingCountries?.value) {
      countries = shippingCountries.value;
    } else {
      // Get all countries if all are allowed
      const { data: allCountries } = await wcApi.get("data/countries");
      countries = allCountries.map((c) => ({
        code: c.code,
        name: c.name,
      }));
    }

    // Cache the result (24 hours)
    await redis.setex("shipping:countries", 86400, JSON.stringify(countries));

    return countries;
  } catch (error) {
    console.error("Failed to fetch shipping countries:", error.message);
    // Return default UK if error
    return [{ code: "GB", name: "United Kingdom" }];
  }
};

/**
 * Clear shipping cache (called when settings change)
 */
export const clearShippingCache = async () => {
  try {
    const keys = await redis.keys("shipping:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return true;
  } catch (error) {
    console.error("Failed to clear shipping cache:", error.message);
    return false;
  }
};
