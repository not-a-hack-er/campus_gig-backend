const axios = require("axios");
const { env } = require("../config/env");
const logger = require("../config/logger");
const ApiError = require("../utils/ApiError");

const CASHFREE_CURRENCY = "INR";

const getCashfreeHeaders = () => {
  if (!env.CASHFREE_CLIENT_ID || !env.CASHFREE_CLIENT_SECRET) {
    throw new ApiError(503, "Cashfree payment gateway is not configured");
  }

  return {
    "x-client-id": env.CASHFREE_CLIENT_ID,
    "x-client-secret": env.CASHFREE_CLIENT_SECRET,
    "x-api-version": env.CASHFREE_API_VERSION,
    "content-type": "application/json",
  };
};

const validateCreateOrderInput = ({
  orderId,
  amount,
  customerId,
  customerName,
  customerEmail,
  customerPhone,
}) => {
  const requiredFields = {
    orderId,
    amount,
    customerId,
    customerName,
    customerEmail,
    customerPhone,
  };
  const missingField = Object.entries(requiredFields).find(
    ([, value]) => value === undefined || value === null || String(value).trim() === ""
  );

  if (missingField) {
    throw new ApiError(400, `${missingField[0]} is required`);
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new ApiError(400, "amount must be a positive number");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(customerEmail))) {
    throw new ApiError(400, "customerEmail must be a valid email address");
  }

  return {
    orderId: String(orderId).trim(),
    amount: numericAmount,
    customerId: String(customerId).trim(),
    customerName: String(customerName).trim(),
    customerEmail: String(customerEmail).trim(),
    customerPhone: String(customerPhone).trim(),
  };
};

const handleCashfreeError = (error, operation) => {
  if (axios.isAxiosError(error)) {
    logger.error(
      {
        operation,
        status: error.response && error.response.status,
        response: error.response && error.response.data,
      },
      "Cashfree API request failed"
    );
    throw new ApiError(502, "Cashfree payment gateway request failed");
  }

  throw error;
};

const createCashfreeOrder = async (input) => {
  const {
    orderId,
    amount,
    customerId,
    customerName,
    customerEmail,
    customerPhone,
  } = validateCreateOrderInput(input || {});

  try {
    const response = await axios.post(
      `${env.CASHFREE_BASE_URL}/orders`,
      {
        order_id: orderId,
        order_amount: amount,
        order_currency: CASHFREE_CURRENCY,
        customer_details: {
          customer_id: customerId,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
        },
      },
      { headers: getCashfreeHeaders() }
    );

    const data = response.data;
    return {
      order_id: data.order_id,
      cf_order_id: data.cf_order_id,
      payment_session_id: data.payment_session_id,
      order_amount: data.order_amount,
      order_currency: data.order_currency,
      order_status: data.order_status,
    };
  } catch (error) {
    return handleCashfreeError(error, "create-order");
  }
};

const getCashfreeOrderStatus = async (orderId) => {
  if (!orderId || !String(orderId).trim()) {
    throw new ApiError(400, "orderId is required");
  }

  try {
    const response = await axios.get(
      `${env.CASHFREE_BASE_URL}/orders/${encodeURIComponent(String(orderId).trim())}`,
      { headers: getCashfreeHeaders() }
    );
    const data = response.data;

    return {
      order_id: data.order_id,
      order_amount: data.order_amount,
      order_currency: data.order_currency,
      order_status: data.order_status,
      paid: data.order_status === "PAID",
    };
  } catch (error) {
    return handleCashfreeError(error, "order-status");
  }
};

module.exports = {
  createCashfreeOrder,
  getCashfreeOrderStatus,
};
