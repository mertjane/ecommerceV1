import WooCommerceRestApiPkg from "@woocommerce/woocommerce-rest-api";
import dotenv from "dotenv";

dotenv.config();

const WooCommerceRestApi = WooCommerceRestApiPkg.default;

if (!process.env.WC_SITE_URL)
  throw new Error("WC_SITE_URL env missing!");

const wcApi = new WooCommerceRestApi({
  url: process.env.WC_SITE_URL,
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: "wc/v3",
});

export default wcApi;
