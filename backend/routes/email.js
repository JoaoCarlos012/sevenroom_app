"use strict";

const express = require("express");
const { sendEmail } = require("../services/smtpService");
const { verifyFirebaseToken } = require("../services/firebaseAuthService");

const router = express.Router();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_PER_MINUTE || 20);
const attempts = new Map();

router.post("/send", authenticate, rateLimit, async (req, res) => {
  const validation = validatePayload(req.body);
  if (!validation.valid) {
    res.status(400).json({ success: false, error: validation.error });
    return;
  }

  try {
    await sendEmail(req.body);
    res.json({ success: true });
  } catch (error) {
    console.error("Email send failed:", {
      code: error.code,
      message: error.message,
      response: error.response,
      to: req.body && req.body.to,
      subject: req.body && req.body.subject,
    });
    const payload = { success: false, error: "Failed to send email" };
    if (req.authenticatedWithApiSecret) {
      payload.details = {
        code: error.code,
        response: error.response,
        message: error.message,
      };
    }
    res.status(502).json(payload);
  }
});

async function authenticate(req, res, next) {
  const expectedToken = process.env.API_SECRET;
  const auth = req.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";

  if (!token) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  if (expectedToken && token === expectedToken) {
    req.authenticatedWithApiSecret = true;
    next();
    return;
  }

  try {
    req.user = await verifyFirebaseToken(token);
    next();
  } catch (error) {
    console.error("Invalid auth token:", error.message);
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
}

function rateLimit(req, res, next) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const record = attempts.get(key) || { count: 0, resetAt: now + WINDOW_MS };

  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + WINDOW_MS;
  }

  record.count += 1;
  attempts.set(key, record);

  if (record.count > MAX_REQUESTS) {
    res.status(429).json({ success: false, error: "Too many requests" });
    return;
  }

  next();
}

function validatePayload(body) {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Payload must be an object" };
  }

  const recipients = Array.isArray(body.to) ? body.to : [body.to];
  if (recipients.length === 0 || recipients.length > 10) {
    return { valid: false, error: "Provide between 1 and 10 recipients" };
  }

  if (!recipients.every(isValidEmail)) {
    return { valid: false, error: "Invalid recipient" };
  }

  if (typeof body.subject !== "string" || body.subject.trim().length === 0) {
    return { valid: false, error: "Subject is required" };
  }

  if (body.subject.length > 160) {
    return { valid: false, error: "Subject is too long" };
  }

  if (typeof body.html !== "string" || body.html.trim().length === 0) {
    return { valid: false, error: "HTML body is required" };
  }

  if (body.html.length > 20000) {
    return { valid: false, error: "HTML body is too large" };
  }

  return { valid: true };
}

function isValidEmail(value) {
  return (
    typeof value === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  );
}

module.exports = router;
