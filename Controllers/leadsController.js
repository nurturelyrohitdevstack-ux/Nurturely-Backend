const mongoose = require("mongoose");
const Lead = require("../Modals/Lead");
const Activity = require("../Modals/Activity");
const Task = require("../Modals/Task");
const asyncHandler = require("../Utils/asyncHandler");

// Helper to enforce lead access rules
const getLeadAccessQuery = (user) => {
  if (user.role === "admin") {
    return {};
  }
  // Sales users only see leads assigned to them or created by them
  return {
    $or: [{ assignedTo: user._id }, { createdBy: user._id }],
  };
};

// @desc    Get all leads with search, filter, sort and pagination
// @route   GET /api/leads
// @access  Private
const getLeads = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search,
    status,
    source,
    priority,
    assignedTo,
    sortBy = "createdAt",
    order = "desc",
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const skip = (pageNum - 1) * limitNum;

  // Base scope based on user role
  const query = { ...getLeadAccessQuery(req.user) };

  // Status filter
  if (status && status !== "all") {
    query.status = status;
  }

  // Source filter
  if (source && source !== "all") {
    query.source = source;
  }

  // Priority filter
  if (priority && priority !== "all") {
    query.priority = priority;
  }

  // Assignee filter (Admin can filter by specific user)
  if (assignedTo && assignedTo !== "all" && req.user.role === "admin") {
    if (mongoose.Types.ObjectId.isValid(assignedTo)) {
      query.assignedTo = assignedTo;
    }
  }

  // Text search
  if (search && search.trim() !== "") {
    const searchRegex = new RegExp(search.trim(), "i");
    const searchConditions = [
      { fullName: searchRegex },
      { company: searchRegex },
      { email: searchRegex },
      { phone: searchRegex },
      { requirements: searchRegex },
    ];

    if (query.$or) {
      query.$and = [{ $or: query.$or }, { $or: searchConditions }];
      delete query.$or;
    } else {
      query.$or = searchConditions;
    }
  }

  // Allowed sort fields to prevent unsafe query injection
  const allowedSortFields = [
    "createdAt",
    "updatedAt",
    "fullName",
    "company",
    "estimatedValue",
    "nextFollowUpAt",
    "status",
    "priority",
  ];

  const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
  const sortDirection = order === "asc" ? 1 : -1;
  const sort = { [sortField]: sortDirection };

  const [leads, total] = await Promise.all([
    Lead.find(query)
      .populate("assignedTo", "fullName email role")
      .populate("createdBy", "fullName email")
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Lead.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    leads,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum) || 1,
    },
  });
});

// @desc    Get single lead by ID
// @route   GET /api/leads/:leadId
// @access  Private
const getLeadById = asyncHandler(async (req, res) => {
  const { leadId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid Lead ID format.",
    });
  }

  const query = { _id: leadId, ...getLeadAccessQuery(req.user) };

  const lead = await Lead.findOne(query)
    .populate("assignedTo", "fullName email phone role")
    .populate("createdBy", "fullName email");

  if (!lead) {
    return res.status(404).json({
      success: false,
      message: "Lead not found or you are not authorized to view it.",
    });
  }

  res.status(200).json({
    success: true,
    lead,
  });
});

// @desc    Create a new lead
// @route   POST /api/leads
// @access  Private
const createLead = asyncHandler(async (req, res) => {
  const {
    fullName,
    email,
    phone,
    company,
    jobTitle,
    source,
    status = "New",
    priority = "Medium",
    estimatedValue = 0,
    currency = "USD",
    assignedTo,
    requirements,
    tags,
    nextFollowUpAt,
  } = req.body;

  if (!fullName || fullName.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Lead full name is required.",
    });
  }

  // Duplicate warning detection by email or phone
  let duplicateWarning = null;
  if (email || phone) {
    const dupQuery = {
      $or: [
        ...(email ? [{ email: email.toLowerCase().trim() }] : []),
        ...(phone ? [{ phone: phone.trim() }] : []),
      ],
    };
    const existing = await Lead.findOne(dupQuery).select("fullName company email phone");
    if (existing) {
      duplicateWarning = `Note: An existing lead '${existing.fullName}' (${existing.company || "No company"}) shares this email or phone.`;
    }
  }

  // Assignment check: Admin can assign to anyone; sales can assign to themselves or leave unassigned
  let finalAssignedTo = null;
  if (req.user.role === "admin" && assignedTo) {
    finalAssignedTo = assignedTo;
  } else if (req.user.role === "sales") {
    finalAssignedTo = assignedTo || req.user._id;
  }

  const lead = await Lead.create({
    fullName: fullName.trim(),
    email: email ? email.toLowerCase().trim() : "",
    phone: phone ? phone.trim() : "",
    company: company ? company.trim() : "",
    jobTitle: jobTitle ? jobTitle.trim() : "",
    source: source || "Website",
    status,
    priority,
    estimatedValue: Number(estimatedValue) || 0,
    currency: currency || "INR",
    assignedTo: finalAssignedTo,
    createdBy: req.user._id,
    requirements: requirements ? requirements.trim() : "",
    tags: Array.isArray(tags) ? tags : [],
    nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null,
  });

  // Log initial activity
  await Activity.create({
    lead: lead._id,
    createdBy: req.user._id,
    type: "status_change",
    summary: `Lead created with status '${lead.status}'`,
    details: `Source: ${lead.source}, Priority: ${lead.priority}`,
    metadata: { newStatus: lead.status },
  });

  const populatedLead = await Lead.findById(lead._id)
    .populate("assignedTo", "fullName email role")
    .populate("createdBy", "fullName email");

  res.status(201).json({
    success: true,
    lead: populatedLead,
    message: "Lead created successfully",
    warning: duplicateWarning,
  });
});

// @desc    Update lead details
// @route   PATCH /api/leads/:leadId
// @access  Private
const updateLead = asyncHandler(async (req, res) => {
  const { leadId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    return res.status(400).json({ success: false, message: "Invalid Lead ID." });
  }

  const query = { _id: leadId, ...getLeadAccessQuery(req.user) };
  const lead = await Lead.findOne(query);

  if (!lead) {
    return res.status(404).json({
      success: false,
      message: "Lead not found or access denied.",
    });
  }

  const editableFields = [
    "fullName",
    "email",
    "phone",
    "company",
    "jobTitle",
    "source",
    "priority",
    "estimatedValue",
    "currency",
    "requirements",
    "tags",
    "lastContactedAt",
    "nextFollowUpAt",
    "lostReason",
  ];

  editableFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      lead[field] = req.body[field];
    }
  });

  if (req.user.role === "admin" && req.body.assignedTo !== undefined) {
    const previousAssignee = lead.assignedTo;
    lead.assignedTo = req.body.assignedTo || null;

    if (String(previousAssignee) !== String(lead.assignedTo)) {
      await Activity.create({
        lead: lead._id,
        createdBy: req.user._id,
        type: "assignment_change",
        summary: `Lead assigned to user: ${lead.assignedTo || "Unassigned"}`,
        metadata: { previousAssignee, newAssignee: lead.assignedTo },
      });
    }
  }

  await lead.save();

  const updatedLead = await Lead.findById(lead._id)
    .populate("assignedTo", "fullName email role")
    .populate("createdBy", "fullName email");

  res.status(200).json({
    success: true,
    message: "Lead updated successfully",
    lead: updatedLead,
  });
});

// @desc    Update lead pipeline stage
// @route   PATCH /api/leads/:leadId/status
// @access  Private
const updateLeadStatus = asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  const { status, lostReason } = req.body;

  const validStages = [
    "New",
    "Contacted",
    "Meeting Scheduled",
    "Qualified",
    "Proposal Sent",
    "Proposal",
    "In Negotiation",
    "Won",
    "Lost",
    "On Hold",
  ];

  if (!status || !validStages.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Invalid stage. Must be one of: ${validStages.join(", ")}`,
    });
  }

  if (status === "Lost" && (!lostReason || lostReason.trim() === "")) {
    return res.status(400).json({
      success: false,
      message: "A lost reason is required when moving a lead to Lost stage.",
    });
  }

  const query = { _id: leadId, ...getLeadAccessQuery(req.user) };
  const lead = await Lead.findOne(query);

  if (!lead) {
    return res.status(404).json({
      success: false,
      message: "Lead not found or unauthorized.",
    });
  }

  const previousStatus = lead.status;
  lead.status = status;
  if (status === "Lost") {
    lead.lostReason = lostReason ? lostReason.trim() : "";
  } else {
    lead.lostReason = "";
  }

  await lead.save();

  // Record stage transition in activities
  await Activity.create({
    lead: lead._id,
    createdBy: req.user._id,
    type: "status_change",
    summary: `Stage transitioned from '${previousStatus}' to '${status}'`,
    details: status === "Lost" ? `Reason: ${lead.lostReason}` : "",
    metadata: { previousStatus, newStatus: status },
  });

  const updatedLead = await Lead.findById(lead._id)
    .populate("assignedTo", "fullName email role")
    .populate("createdBy", "fullName email");

  res.status(200).json({
    success: true,
    message: `Lead moved to ${status}`,
    lead: updatedLead,
  });
});

// @desc    Assign lead to team member
// @route   PATCH /api/leads/:leadId/assign
// @access  Private (Admin only or manager)
const assignLead = asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  const { assignedTo } = req.body;

  const query = { _id: leadId, ...getLeadAccessQuery(req.user) };
  const lead = await Lead.findOne(query);

  if (!lead) {
    return res.status(404).json({ success: false, message: "Lead not found." });
  }

  const prev = lead.assignedTo;
  lead.assignedTo = assignedTo || null;
  await lead.save();

  await Activity.create({
    lead: lead._id,
    createdBy: req.user._id,
    type: "assignment_change",
    summary: "Assignment updated",
    metadata: { previousAssignee: prev, newAssignee: lead.assignedTo },
  });

  const updatedLead = await Lead.findById(lead._id)
    .populate("assignedTo", "fullName email role")
    .populate("createdBy", "fullName email");

  res.status(200).json({
    success: true,
    message: "Lead assigned successfully",
    lead: updatedLead,
  });
});

// @desc    Delete lead
// @route   DELETE /api/leads/:leadId
// @access  Private (Admin only)
const deleteLead = asyncHandler(async (req, res) => {
  const { leadId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    return res.status(400).json({ success: false, message: "Invalid Lead ID." });
  }

  const query = { _id: leadId, ...getLeadAccessQuery(req.user) };
  const lead = await Lead.findOne(query);

  if (!lead) {
    return res.status(404).json({
      success: false,
      message: "Lead not found or unauthorized.",
    });
  }

  // Delete associated activities and tasks for hygiene
  await Promise.all([
    Activity.deleteMany({ lead: leadId }),
    Task.deleteMany({ lead: leadId }),
    Lead.findByIdAndDelete(leadId),
  ]);

  res.status(200).json({
    success: true,
    message: "Lead and related records deleted successfully.",
  });
});

module.exports = {
  getLeads,
  getLeadById,
  createLead,
  updateLead,
  updateLeadStatus,
  assignLead,
  deleteLead,
};
