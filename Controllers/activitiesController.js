const mongoose = require("mongoose");
const Activity = require("../Modals/Activity");
const Lead = require("../Modals/Lead");
const asyncHandler = require("../Utils/asyncHandler");

// Helper to check user permission for this lead
const verifyLeadAccess = async (leadId, user) => {
  if (!mongoose.Types.ObjectId.isValid(leadId)) return null;

  const query = { _id: leadId };
  if (user.role !== "admin") {
    query.$or = [{ assignedTo: user._id }, { createdBy: user._id }];
  }

  return await Lead.findOne(query);
};

// @desc    Get all activities for a lead
// @route   GET /api/leads/:leadId/activities
// @access  Private
const getActivitiesByLead = asyncHandler(async (req, res) => {
  const { leadId } = req.params;

  const lead = await verifyLeadAccess(leadId, req.user);
  if (!lead) {
    return res.status(404).json({
      success: false,
      message: "Lead not found or access denied.",
    });
  }

  const activities = await Activity.find({ lead: leadId })
    .populate("createdBy", "fullName email role")
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    count: activities.length,
    activities,
  });
});

// @desc    Log a new interaction or note for a lead
// @route   POST /api/leads/:leadId/activities
// @access  Private
const createActivity = asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  const { type = "note", summary, details, metadata } = req.body;

  if (!summary || summary.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Activity summary is required.",
    });
  }

  const lead = await verifyLeadAccess(leadId, req.user);
  if (!lead) {
    return res.status(404).json({
      success: false,
      message: "Lead not found or access denied.",
    });
  }

  const activity = await Activity.create({
    lead: leadId,
    createdBy: req.user._id,
    type,
    summary: summary.trim(),
    details: details ? details.trim() : "",
    metadata: metadata || {},
  });

  // If activity is a call, email, or meeting, update lead's lastContactedAt
  if (["call", "email", "meeting"].includes(type)) {
    lead.lastContactedAt = new Date();
    await lead.save();
  }

  const populatedActivity = await Activity.findById(activity._id).populate(
    "createdBy",
    "fullName email role"
  );

  res.status(201).json({
    success: true,
    message: "Activity recorded successfully",
    activity: populatedActivity,
  });
});

module.exports = {
  getActivitiesByLead,
  createActivity,
};
