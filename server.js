import cron from "node-cron";
import dotenv from "dotenv";
import app from "./app.js";
import { cacheAllCategoriesOnStart, cachePopularProductsOnStart, fetchAllProducts } from "./services/products.service.js";
import { cacheFilterOptionsOnStart } from "./services/filter.service.js";
import { cacheMenuOnStart } from "./services/menu.service.js";
import redisClient from "./config/redis.js"

dotenv.config();

const PORT = process.env.PORT || 4000;

const runFullRefresh = async () => {
  console.log("Starting Automatic Background Cache Refresh...");
  try {
    await Promise.all([
      fetchAllProducts(true),          // 'true' forces it to ignore old cache
      cacheFilterOptionsOnStart(true), // (Assuming you add forceRefresh to these too)
      cacheAllCategoriesOnStart(true),
      cachePopularProductsOnStart(true),
      cacheMenuOnStart(true),          // Megamenu cache (1 hour TTL)
    ]);
    console.log("All caches are now fresh!");
  } catch (err) {
    console.error("Background refresh failed:", err);
  }
}

const startServer = async () => {
  try {
    // 1. Connect to Redis (if not already connected in config)
    // await redisClient.connect(); 

    console.log("--- Starting Server Initialization ---");

    // 1. Initial cleanup and load
    await redisClient.flushall();
    await runFullRefresh();

    // 2. Set a schedule: Run every 24 hours (e.g., at 3:00 AM)
    // This happens automatically while the server is running. No restart needed.
    cron.schedule("0 3 * * *", async () => {
      const startTime = new Date().toLocaleString();
      console.log(`\n--- Cron Job Started: ${startTime} ---`);

      try {
        await runFullRefresh();

        const endTime = new Date().toLocaleString();
        console.log(`--- Cron Job Finished: ${endTime} ---`);
        console.log("Next refresh scheduled for tomorrow at 3:00 AM.\n");
      } catch (error) {
        console.error(`--- Cron Job Failed at ${new Date().toLocaleString()} ---`);
        console.error("Reason:", error.message);
      }
    });

    // 3. Start listening for traffic ONLY after cache is ready
    app.listen(PORT, () => {
      console.log(`\nServer is ready and running on port ${PORT}`);
      console.log(`http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1); // Exit if we can't connect/cache
  }
};

startServer();