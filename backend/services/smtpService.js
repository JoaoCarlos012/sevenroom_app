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

  await getTransporter().sendMail({
    from,
    to: recipients,
    subject: subject.trim(),
    html,
  });
}

function requiredEnv(name) {
  const value = process.env[name] && process.env[name].trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

module.exports = { sendEmail };
