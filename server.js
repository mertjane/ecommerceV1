import { cacheAllCategoriesOnStart, cachePopularProductsOnStart, fetchAllProducts} from "./services/products.service.js";
import dotenv from "dotenv";
import app from "./app.js";
import redisClient from "./config/redis.js";
import { cacheFilterOptionsOnStart } from "./services/filter.service.js";

dotenv.config();

const PORT = process.env.PORT || 4000;

const startServer = async () => {
  try {
    // 1. Connect to Redis (if not already connected in config)
    // await redisClient.connect(); 

    console.log("--- Starting Server Initialization ---");

    // 2. Clear old cache to ensure fresh data on restart
    console.log("Flushing Redis...");
    await redisClient.flushall(); 
    console.log("Redis is clean.");

    // 3. Warm up the Cache (Run these in parallel for speed)
    console.log("Warming up cache (fetching data from WooCommerce)...");
    
    // We use Promise.all to run them at the same time, reducing startup time
    await Promise.all([
      fetchAllProducts(),           // Fetches & Caches all products
      cacheFilterOptionsOnStart(),  // Caches colors, sizes, etc.
      cacheAllCategoriesOnStart(),  // Caches categories
      cachePopularProductsOnStart() // Caches homepage data
    ]);

    console.log("Cache Warming Complete!");

    // 4. Start listening for traffic ONLY after cache is ready
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