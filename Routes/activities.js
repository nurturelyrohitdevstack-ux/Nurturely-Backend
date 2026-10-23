const express = require("express");
const router = express.Router();
const protect = require("../Middleware/protect");
const Activity = require("../Modals/Activity");
const asyncHandler = require("../Utils/asyncHandler");

router.use(protect);

// @desc    Get recent activities across CRM (admin or scoped)
// @route   GET /api/activities/recent
router.get(
  "/recent",
  asyncHandler(async (req, res) => {
    const activities = await Activity.find({})
      .populate("lead", "fullName company status")
      .populate("createdBy", "fullName email role")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.status(200).json({
      success: true,
      activities,
    });
  })
);

module.exports = router;
