import { v2 as cloudinary } from "cloudinary";

console.log("=== CLOUDINARY CONFIGURATION ===");
console.log("Cloud Name:", process.env.CLOUD_NAME ? "✓ Set" : "✗ Missing");
console.log("API Key:", process.env.CLOUD_API_KEY ? "✓ Set" : "✗ Missing");
console.log("API Secret:", process.env.CLOUD_API_SECRET ? "✓ Set" : "✗ Missing");

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
  secure: true,
});

console.log("Cloudinary configured successfully");

export default cloudinary;
