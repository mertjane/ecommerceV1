import express from "express";
import cors from "cors";
import productsRoutes from "./routes/products.route.js";
import searchRoutes from "./routes/search.route.js";
import postsRoutes from "./routes/posts.route.js";
import wooPagesRoutes from "./routes/woo-pages.route.js";
import authRoutes from "./routes/auth.route.js";
import variationsRoutes from "./routes/variations.route.js";
import filterRoutes from "./routes/filter.route.js";
import menuRoute from "./routes/menu.route.js";

const app = express();

// Enable CORS for all origins
app.use(cors());

app.use(express.json());

// Routes
app.use("/api/menu", menuRoute);
app.use("/api/products", productsRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/posts", postsRoutes);
app.use("/api/pages", wooPagesRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/variations", variationsRoutes);
app.use("/api/filters", filterRoutes);



export default app;
