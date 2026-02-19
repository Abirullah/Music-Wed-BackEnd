import cloudinary from "../Config/cloudnary.js";
import dns from "node:dns/promises";

const DEFAULT_UPLOAD_TIMEOUT_MS = 120_000;
const DEFAULT_DNS_TIMEOUT_MS = 5_000;
const CLOUDINARY_UPLOAD_HOST = process.env.CLOUDINARY_UPLOAD_HOST || "api.cloudinary.com";

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getUploadTimeoutMs = (timeoutMs) => {
  return parsePositiveInteger(
    timeoutMs,
    parsePositiveInteger(
      process.env.CLOUDINARY_UPLOAD_TIMEOUT_MS,
      DEFAULT_UPLOAD_TIMEOUT_MS,
    ),
  );
};

const getDnsTimeoutMs = () => {
  return parsePositiveInteger(
    process.env.CLOUDINARY_DNS_TIMEOUT_MS,
    DEFAULT_DNS_TIMEOUT_MS,
  );
};

const isCloudinaryConfigured = () => {
  return Boolean(
    process.env.CLOUD_NAME &&
      process.env.CLOUD_API_KEY &&
      process.env.CLOUD_API_SECRET,
  );
};

const resolveHostWithTimeout = async (host, timeoutMs) => {
  return Promise.race([
    dns.lookup(host),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`DNS lookup timed out for ${host}`));
      }, timeoutMs);
    }),
  ]);
};

export const uploadBufferToCloudinary = async (
  file,
  { folder = "uploads", resourceType = "auto", timeoutMs } = {},
) => {
  console.log(`=== CLOUDINARY UPLOAD START ===`);
  console.log(`File: ${file?.originalname || 'unknown'}`);
  console.log(`Size: ${file?.size || 0} bytes`);
  console.log(`Folder: ${folder}`);
  console.log(`Resource Type: ${resourceType}`);
  
  if (!file?.buffer) {
    console.log("ERROR: No file buffer provided");
    throw new Error("Invalid file provided");
  }

  if (!isCloudinaryConfigured()) {
    console.log("ERROR: Cloudinary not configured");
    throw new Error("Cloudinary credentials are missing in backend .env");
  }

  const dnsTimeoutMs = getDnsTimeoutMs();
  try {
    console.log(
      `Checking DNS reachability for ${CLOUDINARY_UPLOAD_HOST} (timeout ${dnsTimeoutMs}ms)...`,
    );
    await resolveHostWithTimeout(CLOUDINARY_UPLOAD_HOST, dnsTimeoutMs);
    console.log(`DNS check passed for ${CLOUDINARY_UPLOAD_HOST}`);
  } catch (error) {
    console.log("DNS reachability check failed:", error);
    throw new Error(
      `Cloudinary host DNS failed (${CLOUDINARY_UPLOAD_HOST}). Check internet/DNS and retry.`,
    );
  }

  const resolvedTimeoutMs = getUploadTimeoutMs(timeoutMs);
  console.log(`Upload timeout: ${resolvedTimeoutMs}ms`);

  return new Promise((resolve, reject) => {
    let isSettled = false;
    let timeoutHandle;

    const settle = (handler, value) => {
      if (isSettled) return;
      isSettled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      handler(value);
    };

    console.log("Creating Cloudinary upload stream...");
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        timeout: resolvedTimeoutMs,
      },
      (error, result) => {
        if (error) {
          console.log("Cloudinary upload callback ERROR:", error);
          settle(
            reject,
            new Error(error?.message || "Cloudinary upload failed"),
          );
          return;
        }

        if (!result?.secure_url) {
          console.log("Cloudinary upload callback: No secure_url in result");
          settle(
            reject,
            new Error("Cloudinary upload failed to return a file URL"),
          );
          return;
        }

        console.log("Cloudinary upload callback SUCCESS:", result.secure_url);
        settle(resolve, result);
      },
    );

    stream.on("error", (error) => {
      console.log("Cloudinary stream ERROR event:", error);
      settle(
        reject,
        new Error(error?.message || "Cloudinary upload stream failed"),
      );
    });

    timeoutHandle = setTimeout(() => {
      console.log("Cloudinary upload TIMEOUT triggered");
      const timeoutError = new Error(
        `Cloudinary upload timed out after ${Math.ceil(resolvedTimeoutMs / 1000)} seconds`,
      );
      stream.destroy(timeoutError);
      settle(reject, timeoutError);
    }, resolvedTimeoutMs);

    try {
      console.log("Sending buffer to Cloudinary stream...");
      stream.end(file.buffer);
      console.log("Buffer sent to stream successfully");
    } catch (error) {
      console.log("ERROR sending buffer to stream:", error);
      settle(
        reject,
        error instanceof Error ? error : new Error("Failed to send upload buffer"),
      );
    }
  });
};
