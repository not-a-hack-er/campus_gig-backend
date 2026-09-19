const express = require("express");
const {
  createOrderController,
  getOrderStatusController,
} = require("../controllers/paymentController");

const router = express.Router();

router.post("/create-order", createOrderController);
router.get("/order-status/:orderId", getOrderStatusController);

module.exports = router;
