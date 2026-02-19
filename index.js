import express from "express";
import cors from "cors";
import { createServer } from "http";
import dotenv from "dotenv";
import RoutesIndex from "./Routes/RoutesIndex.js";
import connectDB from "./Config/DataBase.js";

dotenv.config();
connectDB();

const app = express();
const httpServer = createServer(app);

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((value) => value.trim())
  : "*";

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

RoutesIndex(app);

const PORT = process.env.PORT || 5000;

// Set server timeout to handle large file uploads (10 minutes)
httpServer.timeout = 600000; // 10 minutes in milliseconds
httpServer.keepAliveTimeout = 610000; // Slightly longer than timeout
httpServer.headersTimeout = 620000; // Slightly longer than keepAliveTimeout

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Server timeout set to: ${httpServer.timeout}ms`);
});
    