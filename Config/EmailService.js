import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

let transporterCache = null;

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
};

const parsePort = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseFamily = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (parsed === 4 || parsed === 6) return parsed;
  return fallback;
};

const normalizeEmailPassword = ({ host, service, password }) => {
  const loweredHost = String(host || "").toLowerCase();
  const loweredService = String(service || "").toLowerCase();
  const rawPassword = String(password || "");
  const isGmail =
    loweredHost.includes("gmail") || loweredService.includes("gmail");

  if (!isGmail) return rawPassword;

  // Gmail app passwords are often copied with spaces between 4-char groups.
  return rawPassword.replace(/\s+/g, "");
};

const getSmtpBaseConfig = () => {
  const emailUser = String(process.env.EMAIL_USER || "").trim();
  const emailHost = String(process.env.EMAIL_HOST || "").trim();
  const emailService = String(process.env.EMAIL_SERVICE || "").trim();
  const emailPass = normalizeEmailPassword({
    host: emailHost,
    service: emailService,
    password: String(process.env.EMAIL_PASS || "").trim(),
  });
  const emailPort = parsePort(process.env.EMAIL_PORT, 587);
  const emailSecure = parseBoolean(process.env.EMAIL_SECURE, emailPort === 465);
  const dnsFamily = parseFamily(process.env.EMAIL_DNS_FAMILY, 0);
  const connectionTimeout = parsePort(process.env.EMAIL_CONNECTION_TIMEOUT_MS, 15000);
  const greetingTimeout = parsePort(process.env.EMAIL_GREETING_TIMEOUT_MS, 10000);
  const socketTimeout = parsePort(process.env.EMAIL_SOCKET_TIMEOUT_MS, 20000);

  return {
    emailUser,
    emailHost,
    emailService,
    emailPass,
    emailPort,
    emailSecure,
    dnsFamily,
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
  };
};

const getTransporter = () => {
  if (transporterCache) return transporterCache;

  const {
    emailUser,
    emailHost,
    emailService,
    emailPass,
    emailPort,
    emailSecure,
    dnsFamily,
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
  } = getSmtpBaseConfig();

  if (!emailUser || !emailPass) {
    return null;
  }

  transporterCache = emailHost
    ? nodemailer.createTransport({
        host: emailHost,
        port: emailPort,
        secure: emailSecure,
        requireTLS: !emailSecure,
        family: dnsFamily || undefined,
        connectionTimeout,
        greetingTimeout,
        socketTimeout,
        auth: {
          user: emailUser,
          pass: emailPass,
        },
      })
    : nodemailer.createTransport({
        service: emailService || "Gmail",
        auth: {
          user: emailUser,
          pass: emailPass,
        },
      });

  return transporterCache;
};

const shouldAttemptGmailFallback = (errorCode) => {
  const code = String(errorCode || "").toUpperCase();
  return ["ESOCKET", "ECONNECTION", "ETIMEDOUT", "EDNS"].includes(code);
};

const isGmailConfig = ({ emailHost, emailService }) => {
  return (
    String(emailHost || "").toLowerCase().includes("gmail") ||
    String(emailService || "").toLowerCase().includes("gmail")
  );
};

const tryGmailSslFallbackSend = async (mailOptions) => {
  const {
    emailUser,
    emailPass,
    emailHost,
    emailService,
    emailPort,
    emailSecure,
    dnsFamily,
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
  } = getSmtpBaseConfig();

  if (!emailUser || !emailPass) return false;
  if (!isGmailConfig({ emailHost, emailService })) return false;
  if (emailSecure === true && emailPort === 465) return false;

  const fallbackTransporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    family: dnsFamily || undefined,
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });

  await fallbackTransporter.sendMail(mailOptions);
  transporterCache = fallbackTransporter;
  return true;
};

const getFromAddress = () => {
  return (
    String(process.env.EMAIL_FROM || "").trim() ||
    String(process.env.EMAIL_USER || "").trim() ||
    "noreply@echotune.app"
  );
};

export const sendEmail = async ({ to, subject, text, html }) => {
  const recipient = String(to || "").trim();
  const title = String(subject || "").trim();
  if (!recipient || !title) {
    throw new Error("Email recipient and subject are required");
  }

  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      "Email is not configured. Set EMAIL_USER and EMAIL_PASS in backend .env to enable OTP delivery.",
    );
    return false;
  }

  try {
    const mailOptions = {
      from: getFromAddress(),
      to: recipient,
      subject: title,
      text: text || undefined,
      html: html || undefined,
    };
    await transporter.sendMail(mailOptions);
  } catch (error) {
    const code = String(error?.code || "");
    const command = String(error?.command || "");
    const host = String(process.env.EMAIL_HOST || process.env.EMAIL_SERVICE || "");
    console.error("SMTP send failed:", {
      code,
      command,
      host,
      message: error?.message || "Unknown SMTP error",
    });

    if (shouldAttemptGmailFallback(code)) {
      try {
        const mailOptions = {
          from: getFromAddress(),
          to: recipient,
          subject: title,
          text: text || undefined,
          html: html || undefined,
        };
        const usedFallback = await tryGmailSslFallbackSend(mailOptions);
        if (usedFallback) {
          console.warn("SMTP fallback succeeded using Gmail SSL on port 465.");
          return true;
        }
      } catch (fallbackError) {
        console.error("SMTP fallback failed:", {
          code: fallbackError?.code,
          command: fallbackError?.command,
          message: fallbackError?.message,
        });
      }
    }

    if (code === "EAUTH") {
      throw new Error(
        "Email authentication failed. Check EMAIL_USER and EMAIL_PASS (use Gmail app password).",
      );
    }

    if (shouldAttemptGmailFallback(code)) {
      throw new Error(
        "SMTP connection failed. Set EMAIL_SECURE=true and EMAIL_PORT=465 for Gmail, or check firewall/network SMTP access.",
      );
    }

    throw new Error(error?.message || "Failed to send email");
  }

  return true;
};

const getOtpSubject = (purpose) => {
  return purpose === "password_reset"
    ? "EchoTune password reset OTP"
    : "EchoTune account verification OTP";
};

const getOtpIntro = (purpose) => {
  return purpose === "password_reset"
    ? "Use this OTP to reset your EchoTune account password."
    : "Use this OTP to verify your EchoTune account.";
};

export const sendOtpEmail = async ({
  to,
  name,
  otp,
  purpose = "signup",
  expiresInMinutes = 10,
}) => {
  const safeName = String(name || "there").trim() || "there";
  const code = String(otp || "").trim();

  if (!code) {
    throw new Error("OTP is required to send OTP email");
  }

  const subject = getOtpSubject(purpose);
  const intro = getOtpIntro(purpose);
  const text = [
    `Hi ${safeName},`,
    "",
    intro,
    "",
    `OTP: ${code}`,
    `This OTP expires in ${expiresInMinutes} minutes.`,
    "",
    "If you did not request this, you can ignore this email.",
    "",
    "Team EchoTune",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
      <p>Hi ${safeName},</p>
      <p>${intro}</p>
      <p style="font-size: 24px; font-weight: 700; letter-spacing: 4px;">${code}</p>
      <p>This OTP expires in ${expiresInMinutes} minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
      <p>Team EchoTune</p>
    </div>
  `;

  return sendEmail({
    to,
    subject,
    text,
    html,
  });
};

export default {
  sendEmail,
  sendOtpEmail,
};
