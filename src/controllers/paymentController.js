const ApiResponse = require("../utils/ApiResponse");
const {
  createCashfreeOrder,
  getCashfreeOrderStatus,
} = require("../services/paymentService");

const createOrderController = async (req, res, next) => {
  try {
    const order = await createCashfreeOrder(req.body);
    return res.status(201).json(new ApiResponse(true, "Payment order created", order));
  } catch (error) {
    next(error);
  }
};

const getOrderStatusController = async (req, res, next) => {
  try {
    const order = await getCashfreeOrderStatus(req.params.orderId);
    return res.status(200).json(new ApiResponse(true, "Payment order status fetched", order));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrderController,
  getOrderStatusController,
};
