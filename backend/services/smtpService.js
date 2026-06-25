"use strict";

const nodemailer = require("nodemailer");
const dns = require("node:dns");

let transporter;

dns.setDefaultResultOrder("ipv4first");

function getTransporter() {
  if (transporter) return transporter;

  const host = requiredEnv("SMTP_HOST");
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = requiredEnv("SMTP_USER");
  const pass = requiredEnv("SMTP_PASS");

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });

  return transporter;
}

async function sendEmail({ to, subject, html }) {
  const from = process.env.EMAIL_FROM || requiredEnv("SMTP_USER");
  const recipients = Array.isArray(to) ? to : [to];

  if (process.env.GMAIL_REFRESH_TOKEN) {
    await sendWithGmailApi({ from, to: recipients, subject, html });
    return;
  }

  if (process.env.RESEND_API_KEY) {
    await sendWithResend({ from, to: recipients, subject, html });
    return;
  }

  await getTransporter().sendMail({
    from,
    to: recipients,
    subject: subject.trim(),
    html,
  });
}

async function sendWithGmailApi({ from, to, subject, html }) {
  const accessToken = await getGmailAccessToken();
  const raw = buildGmailRawMessage({ from, to, subject, html });
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Gmail API failed with ${response.status}`);
    error.code = "GMAIL_API_ERROR";
    error.response = body;
    throw error;
  }
}

async function getGmailAccessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredEnv("GMAIL_CLIENT_ID"),
      client_secret: requiredEnv("GMAIL_CLIENT_SECRET"),
      refresh_token: requiredEnv("GMAIL_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    const error = new Error(`Gmail token refresh failed with ${response.status}`);
    error.code = "GMAIL_TOKEN_ERROR";
    error.response = JSON.stringify(data);
    throw error;
  }

  return data.access_token;
}

function buildGmailRawMessage({ from, to, subject, html }) {
  const recipients = Array.isArray(to) ? to : [to];
  const message = [
    `From: ${from}`,
    `To: ${recipients.join(", ")}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject.trim(), "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html, "utf8").toString("base64"),
  ].join("\r\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sendWithResend({ from, to, subject, html }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: subject.trim(),
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Resend API failed with ${response.status}`);
    error.code = "RESEND_API_ERROR";
    error.response = body;
    throw error;
  }
}

function requiredEnv(name) {
  const value = process.env[name] && process.env[name].trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

module.exports = { sendEmail };
