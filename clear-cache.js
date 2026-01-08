import redisClient from "./config/redis.js";

const clearCache = async () => {
  try {
    let totalCleared = 0;

    // Clear megamenu cache
    console.log("Clearing megamenu cache...");
    await redisClient.del("megamenu:data");
    console.log("✓ Megamenu cache cleared successfully!");
    totalCleared++;

    // Clear special-deals cache
    console.log("\nClearing all special-deals cache...");
    const specialDealsKeys = await redisClient.keys("special-deals:*");
    if (specialDealsKeys.length > 0) {
      await redisClient.del(...specialDealsKeys);
      console.log(`✓ Cleared ${specialDealsKeys.length} special-deals cache entries`);
      totalCleared += specialDealsKeys.length;
    } else {
      console.log("No special-deals cache entries found");
    }

    // Clear products cache
    console.log("\nClearing all products cache...");
    const productKeys = await redisClient.keys("products:*");
    if (productKeys.length > 0) {
      await redisClient.del(...productKeys);
      console.log(`✓ Cleared ${productKeys.length} products cache entries`);
      totalCleared += productKeys.length;
    } else {
      console.log("No products cache entries found");
    }

    // Clear category cache
    console.log("\nClearing all category cache...");
    const categoryKeys = await redisClient.keys("category:*");
    if (categoryKeys.length > 0) {
      await redisClient.del(...categoryKeys);
      console.log(`✓ Cleared ${categoryKeys.length} category cache entries`);
      totalCleared += categoryKeys.length;
    } else {
      console.log("No category cache entries found");
    }

    // Clear variation cache
    console.log("\nClearing all variation cache...");
    const variationKeys = await redisClient.keys("variation:*");
    if (variationKeys.length > 0) {
      await redisClient.del(...variationKeys);
      console.log(`✓ Cleared ${variationKeys.length} variation cache entries`);
      totalCleared += variationKeys.length;
    } else {
      console.log("No variation cache entries found");
    }

    // Clear variations (plural) cache
    console.log("\nClearing all variations cache...");
    const variationsKeys = await redisClient.keys("variations:*");
    if (variationsKeys.length > 0) {
      await redisClient.del(...variationsKeys);
      console.log(`✓ Cleared ${variationsKeys.length} variations cache entries`);
      totalCleared += variationsKeys.length;
    } else {
      console.log("No variations cache entries found");
    }

    // Clear filter cache
    console.log("\nClearing all filter cache...");
    const filterKeys = await redisClient.keys("filter:*");
    if (filterKeys.length > 0) {
      await redisClient.del(...filterKeys);
      console.log(`✓ Cleared ${filterKeys.length} filter cache entries`);
      totalCleared += filterKeys.length;
    } else {
      console.log("No filter cache entries found");
    }

    // Clear search cache
    console.log("\nClearing all search cache...");
    const searchKeys = await redisClient.keys("search:*");
    if (searchKeys.length > 0) {
      await redisClient.del(...searchKeys);
      console.log(`✓ Cleared ${searchKeys.length} search cache entries`);
      totalCleared += searchKeys.length;
    } else {
      console.log("No search cache entries found");
    }

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log(`✓ Total cache entries cleared: ${totalCleared}`);
    console.log("=".repeat(50));

    process.exit(0);
  } catch (error) {
    console.error("Error clearing cache:", error);
    process.exit(1);
  }
};

clearCache();