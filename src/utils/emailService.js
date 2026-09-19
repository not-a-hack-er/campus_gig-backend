// ============================================================
// utils/emailService.js — Transactional Email Sender
//
// Used exclusively by the forgot-password OTP flow.
//
// SETUP:
//   Add to your .env file:
//     EMAIL_USER=your.gmail@gmail.com
//     EMAIL_PASS=your-gmail-app-password   ← NOT your real Gmail password
//
//   Generate a Gmail App Password at:
//     https://myaccount.google.com/apppasswords
//   (Requires 2-Step Verification to be enabled on your Google account)
//
// DEVELOPMENT WITHOUT CREDENTIALS:
//   If EMAIL_USER / EMAIL_PASS are not set, the OTP is logged to the
//   server console instead of being emailed.  This lets you test the
//   full forgot-password flow locally without any email setup.
// ============================================================

require("dotenv").config();
const dns = require("node:dns");
const { env } = require("../config/env");

// Render's free instances do not provide IPv6 egress. Nodemailer resolves
// smtp.gmail.com through Node, so make IPv4 the preferred DNS result before
// opening the SMTP connection.
dns.setDefaultResultOrder("ipv4first");

let transporter = null;

// Lazily initialise the Nodemailer transport on first use.
// This avoids crashing the server at startup if email is not configured.
const getTransporter = () => {
  if (transporter) return transporter;

  const nodemailer = require("nodemailer");

  const smtpUser = env.SMTP_USER || env.EMAIL_USER;
  const smtpPass = env.SMTP_PASS || env.EMAIL_PASS;

  if (!smtpUser || !smtpPass) {
    return null;
  }

  const host   = env.SMTP_HOST || "smtp.gmail.com";
  const port   = env.SMTP_PORT ? parseInt(env.SMTP_PORT, 10) : (env.SMTP_HOST ? 587 : 587);
  const secure = env.SMTP_SECURE !== null && env.SMTP_SECURE !== undefined
    ? (env.SMTP_SECURE === "true" || env.SMTP_SECURE === true)
    : (port === 465);

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    family: 4,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  return transporter;
};

/**
 * Send a 6-digit OTP to the user's email address.
 *
 * @param {string} toEmail  — recipient email address
 * @param {string} otp      — plaintext 6-digit OTP (NOT hashed)
 * @returns {Promise<boolean>} whether the provider accepted the message
 */
const sendOtpEmail = async (toEmail, otp) => {
  const transport = getTransporter();

  if (!transport) {
    console.warn("[emailService] EMAIL_USER/EMAIL_PASS not configured; no password-reset email was sent.");
    return false;
  }

  const mailOptions = {
    from:    env.EMAIL_FROM || `"CampusVault" <${env.EMAIL_USER}>`,
    to:      toEmail,
    subject: "🔑 Your CampusVault Password Reset OTP",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #1a1a2e; margin-bottom: 8px;">Password Reset Request</h2>
        <p style="color: #444; line-height: 1.6;">
          We received a request to reset your <strong>CampusVault</strong> account password.
          Use the OTP below to proceed. This code expires in <strong>15 minutes</strong>.
        </p>
        <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #6c63ff;">${otp}</span>
        </div>
        <p style="color: #888; font-size: 13px;">
          If you did not request a password reset, please ignore this email.
          Your password will not be changed.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #bbb; font-size: 12px; text-align: center;">CampusVault — Student Marketplace</p>
      </div>
    `,
  };

  try {
    await transport.sendMail(mailOptions);
    console.log("[emailService] Password-reset OTP email accepted by provider");
    return true;
  } catch (error) {
    console.error("[emailService] Password-reset email delivery failed", { message: error.message });
    return false;
  }
};

const isEmailConfigured = () => Boolean((env.SMTP_USER || env.EMAIL_USER) && (env.SMTP_PASS || env.EMAIL_PASS));

module.exports = { sendOtpEmail, isEmailConfigured };

