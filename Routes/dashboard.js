const express = require("express");
const router = express.Router();
const {
  getDashboardSummary,
  getDashboardTrends,
} = require("../Controllers/dashboardController");
const protect = require("../Middleware/protect");

router.use(protect);

router.get("/summary", getDashboardSummary);
router.get("/trends", getDashboardTrends);

module.exports = router;
