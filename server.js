import { cacheAllCategoriesOnStart, cachePopularProductsOnStart } from "./services/products.service.js";
import dotenv from "dotenv";
import app from "./app.js";
import redisClient from "./config/redis.js";

dotenv.config();

const PORT = process.env.PORT || 4000;

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  console.log("Flushing Redis...");
  await redisClient.flushall();
  console.log("Redis is clean.");

  cacheAllCategoriesOnStart();
  cachePopularProductsOnStart();
});