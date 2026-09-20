// ============================================================
// services/paymentService.js — Cashfree Sandbox Integration
// ============================================================

const axios = require("axios");
const crypto = require("crypto");

const { env } = require("../config/env");
const logger = require("../config/logger");
const ApiError = require("../utils/ApiError");

const getCashfreeConfig = () => {
  if (!env.CASHFREE_CLIENT_ID || !env.CASHFREE_CLIENT_SECRET) {
    throw new ApiError(503, "Cashfree payment service is not configured");
  }

  return {
    baseURL: env.CASHFREE_BASE_URL,
    headers: {
      "Content-Type": "application/json",
      "x-api-version": env.CASHFREE_API_VERSION,
      "x-client-id": env.CASHFREE_CLIENT_ID,
      "x-client-secret": env.CASHFREE_CLIENT_SECRET,
    },
  };
};

const handleCashfreeError = (error, operation) => {
  const status = error.response?.status;
  const providerMessage = error.response?.data?.message;

  logger.error({
    operation,
    status,
    providerMessage,
  }, "Cashfree API request failed");

  throw new ApiError(
    status && status >= 400 && status < 500 ? 502 : 503,
    "Cashfree payment request failed"
  );
};

const createOrder = async ({
  orderId,
  amount,
  customerId,
  customerName,
  customerEmail,
  customerPhone,
}) => {
  const config = getCashfreeConfig();

  try {
    const response = await axios.post(
      `${config.baseURL}/orders`,
      {
        order_id: orderId || `order_${Date.now()}_${crypto.randomUUID()}`,
        order_amount: amount,
        order_currency: "INR",
        customer_details: {
          customer_id: customerId,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
        },
      },
      { headers: config.headers }
    );

    return response.data;
  } catch (error) {
    handleCashfreeError(error, "create order");
  }
};

const getOrderStatus = async (orderId) => {
  const config = getCashfreeConfig();

  try {
    const response = await axios.get(
      `${config.baseURL}/orders/${encodeURIComponent(orderId)}`,
      { headers: config.headers }
    );

    const order = response.data;
    return {
      ...order,
      isPaid: order?.order_status === "PAID",
    };
  } catch (error) {
    handleCashfreeError(error, "get order status");
  }
};

module.exports = {
  createOrder,
  getOrderStatus,
};
