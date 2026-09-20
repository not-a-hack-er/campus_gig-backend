// ============================================================
// routes/paymentRoutes.js — Cashfree Payment Endpoints
// ============================================================

const express = require("express");
const protect = require("../middleware/auth");
const {
  createOrderController,
  getOrderStatusController,
} = require("../controllers/paymentController");

const router = express.Router();

router.post("/create-order", protect, createOrderController);
router.get("/order-status/:orderId", protect, getOrderStatusController);

module.exports = router;
