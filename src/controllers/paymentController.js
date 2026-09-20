// ============================================================
// controllers/paymentController.js — Cashfree Payment Handlers
// ============================================================

const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const {
  createOrder,
  getOrderStatus,
} = require("../services/paymentService");

const createOrderController = async (req, res, next) => {
  try {
    const {
      orderId,
      amount,
      customerName,
      customerEmail,
      customerPhone,
    } = req.body;

    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      throw new ApiError(400, "A positive payment amount is required");
    }

    if (!customerName || !customerEmail || !customerPhone) {
      throw new ApiError(400, "Customer name, email, and phone are required");
    }

    const order = await createOrder({
      orderId,
      amount: Number(amount),
      customerId: req.user.id,
      customerName,
      customerEmail,
      customerPhone,
    });

    return res
      .status(201)
      .json(new ApiResponse(true, "Cashfree order created", order));
  } catch (error) {
    next(error);
  }
};

const getOrderStatusController = async (req, res, next) => {
  try {
    if (!req.params.orderId) {
      throw new ApiError(400, "Order ID is required");
    }

    const order = await getOrderStatus(req.params.orderId);
    return res
      .status(200)
      .json(new ApiResponse(true, "Cashfree order status fetched", order));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrderController,
  getOrderStatusController,
};
