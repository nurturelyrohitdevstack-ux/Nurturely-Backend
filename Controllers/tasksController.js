const mongoose = require("mongoose");
const Task = require("../Modals/Task");
const Lead = require("../Modals/Lead");
const Activity = require("../Modals/Activity");
const asyncHandler = require("../Utils/asyncHandler");
const { syncLeadFollowUps, getTodayRange } = require("../Utils/taskSync");

// Helper for task query boundary
const getTaskAccessQuery = (user) => {
  if (user.role === "admin") return {};
  return {
    $or: [{ assignedTo: user._id }, { createdBy: user._id }],
  };
};

// @desc    Get tasks with tab filters (today, upcoming, overdue, completed, all)
// @route   GET /api/tasks
// @access  Private
const getTasks = asyncHandler(async (req, res) => {
  const { filter = "all", leadId, assignedTo, status, tzOffset } = req.query;

  // Auto-sync any leads with nextFollowUpAt into tasks
  await syncLeadFollowUps(req.user);

  const query = { ...getTaskAccessQuery(req.user) };

  if (leadId && mongoose.Types.ObjectId.isValid(leadId)) {
    query.lead = leadId;
  }

  if (assignedTo && assignedTo !== "all" && req.user.role === "admin") {
    if (mongoose.Types.ObjectId.isValid(assignedTo)) {
      query.assignedTo = assignedTo;
    }
  }

  const { startOfToday, endOfToday } = getTodayRange(tzOffset);

  if (filter === "today") {
    query.status = "Pending";
    query.dueAt = { $gte: startOfToday, $lte: endOfToday };
  } else if (filter === "upcoming") {
    query.status = "Pending";
    query.dueAt = { $gt: endOfToday };
  } else if (filter === "overdue") {
    query.status = "Pending";
    query.dueAt = { $lt: startOfToday };
  } else if (filter === "completed") {
    query.status = "Completed";
  } else if (filter === "cancelled" || filter === "skipped") {
    query.status = { $in: ["Cancelled", "Skipped"] };
  } else if (status && status !== "all") {
    query.status = status;
  } else {
    // "all": show all pending tasks by default
    query.status = "Pending";
  }

  const tasks = await Task.find(query)
    .populate("lead", "fullName company email phone status priority nextFollowUpAt requirements")
    .populate("assignedTo", "fullName email")
    .populate("createdBy", "fullName email")
    .sort({ dueAt: 1 })
    .lean();

  // Summary counts for badge tabs
  const baseScope = getTaskAccessQuery(req.user);
  const [totalPending, totalOverdue, totalToday, totalCompleted] = await Promise.all([
    Task.countDocuments({ ...baseScope, status: "Pending" }),
    Task.countDocuments({ ...baseScope, status: "Pending", dueAt: { $lt: startOfToday } }),
    Task.countDocuments({ ...baseScope, status: "Pending", dueAt: { $gte: startOfToday, $lte: endOfToday } }),
    Task.countDocuments({ ...baseScope, status: "Completed" }),
  ]);

  res.status(200).json({
    success: true,
    tasks,
    counts: {
      pending: totalPending,
      overdue: totalOverdue,
      today: totalToday,
      completed: totalCompleted,
    },
  });
});

// @desc    Create follow-up task
// @route   POST /api/tasks
// @access  Private
const createTask = asyncHandler(async (req, res) => {
  const { title, lead: leadId, assignedTo, type = "Call", notes, dueAt, priority = "Medium" } = req.body;

  if (!title || !leadId || !dueAt) {
    return res.status(400).json({
      success: false,
      message: "Task title, associated lead, and due date/time are required.",
    });
  }

  const lead = await Lead.findById(leadId);
  if (!lead) {
    return res.status(404).json({ success: false, message: "Associated lead not found." });
  }

  const assignee = req.user.role === "admin" && assignedTo ? assignedTo : (assignedTo || req.user._id);

  const task = await Task.create({
    title: title.trim(),
    lead: leadId,
    assignedTo: assignee,
    createdBy: req.user._id,
    type,
    notes: notes ? notes.trim() : "",
    dueAt: new Date(dueAt),
    priority,
    status: "Pending",
  });

  // Keep lead's next follow-up date updated if this task is sooner or unset
  if (!lead.nextFollowUpAt || new Date(dueAt) <= new Date(lead.nextFollowUpAt)) {
    lead.nextFollowUpAt = new Date(dueAt);
    await lead.save();
  }

  // Record activity
  await Activity.create({
    lead: leadId,
    createdBy: req.user._id,
    type: "note",
    summary: `Scheduled task: '${task.title}' for ${new Date(dueAt).toLocaleString()}`,
  });

  const populatedTask = await Task.findById(task._id)
    .populate("lead", "fullName company email phone status priority nextFollowUpAt")
    .populate("assignedTo", "fullName email");

  res.status(201).json({
    success: true,
    message: "Follow-up task scheduled successfully",
    task: populatedTask,
  });
});

// @desc    Update task
// @route   PATCH /api/tasks/:taskId
// @access  Private
const updateTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;

  const query = { _id: taskId, ...getTaskAccessQuery(req.user) };
  const task = await Task.findOne(query);

  if (!task) {
    return res.status(404).json({ success: false, message: "Task not found." });
  }

  const allowedFields = ["title", "type", "notes", "dueAt", "priority", "assignedTo", "status"];
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      task[field] = req.body[field];
    }
  });

  if (req.body.dueAt) {
    task.dueAt = new Date(req.body.dueAt);
    if (task.lead) {
      await Lead.findByIdAndUpdate(task.lead, { nextFollowUpAt: task.dueAt });
    }
  }

  if (req.body.status === "Completed" && !task.completedAt) {
    task.completedAt = new Date();
  }

  await task.save();

  // If lead status update requested together
  if (req.body.leadStatus && task.lead) {
    const validStages = [
      "New", "Contacted", "Meeting Scheduled", "Qualified",
      "Proposal Sent", "Proposal", "In Negotiation", "Won", "Lost", "On Hold"
    ];
    if (validStages.includes(req.body.leadStatus)) {
      const lead = await Lead.findById(task.lead);
      if (lead) {
        const oldStatus = lead.status;
        lead.status = req.body.leadStatus;
        if (req.body.leadStatus === "Lost" && req.body.lostReason) {
          lead.lostReason = req.body.lostReason;
        }
        await lead.save();
        await Activity.create({
          lead: lead._id,
          createdBy: req.user._id,
          type: "status_change",
          summary: `Lead stage changed from '${oldStatus}' to '${lead.status}'`,
        });
      }
    }
  }

  const populatedTask = await Task.findById(task._id)
    .populate("lead", "fullName company email phone status priority nextFollowUpAt")
    .populate("assignedTo", "fullName email");

  res.status(200).json({
    success: true,
    message: "Task updated successfully",
    task: populatedTask,
  });
});

// @desc    Reschedule task to a new date / time
// @route   PATCH /api/tasks/:taskId/reschedule
// @access  Private
const rescheduleTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const { dueAt, notes } = req.body;

  if (!dueAt) {
    return res.status(400).json({ success: false, message: "New follow-up date and time is required." });
  }

  const query = { _id: taskId, ...getTaskAccessQuery(req.user) };
  const task = await Task.findOne(query);

  if (!task) {
    return res.status(404).json({ success: false, message: "Task not found." });
  }

  const newDueDate = new Date(dueAt);
  task.dueAt = newDueDate;
  task.status = "Pending";
  if (notes !== undefined && notes.trim() !== "") {
    task.notes = notes.trim();
  }
  await task.save();

  // Sync with Lead
  if (task.lead) {
    await Lead.findByIdAndUpdate(task.lead, { nextFollowUpAt: newDueDate });
    await Activity.create({
      lead: task.lead,
      createdBy: req.user._id,
      type: "note",
      summary: `Follow-up rescheduled to ${newDueDate.toLocaleString()}`,
      details: notes || "",
    });
  }

  const populatedTask = await Task.findById(task._id)
    .populate("lead", "fullName company email phone status priority nextFollowUpAt")
    .populate("assignedTo", "fullName email");

  res.status(200).json({
    success: true,
    message: "Follow-up rescheduled successfully",
    task: populatedTask,
  });
});

// @desc    Skip follow-up task
// @route   PATCH /api/tasks/:taskId/skip
// @access  Private
const skipTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const { reason = "Follow-up skipped by user" } = req.body;

  const query = { _id: taskId, ...getTaskAccessQuery(req.user) };
  const task = await Task.findOne(query);

  if (!task) {
    return res.status(404).json({ success: false, message: "Task not found." });
  }

  task.status = "Cancelled";
  await task.save();

  if (task.lead) {
    // Check if there is another pending task for this lead
    const nextPending = await Task.findOne({
      lead: task.lead,
      status: "Pending",
      _id: { $ne: task._id },
    }).sort({ dueAt: 1 });

    await Lead.findByIdAndUpdate(task.lead, {
      nextFollowUpAt: nextPending ? nextPending.dueAt : null,
    });

    await Activity.create({
      lead: task.lead,
      createdBy: req.user._id,
      type: "note",
      summary: `Skipped follow-up: '${task.title}' (${reason})`,
    });
  }

  res.status(200).json({
    success: true,
    message: "Follow-up task skipped",
    task,
  });
});

// @desc    Mark task as completed
// @route   PATCH /api/tasks/:taskId/complete
// @access  Private
const completeTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const { nextFollowUpAt } = req.body;

  const query = { _id: taskId, ...getTaskAccessQuery(req.user) };
  const task = await Task.findOne(query);

  if (!task) {
    return res.status(404).json({ success: false, message: "Task not found." });
  }

  task.status = "Completed";
  task.completedAt = new Date();
  await task.save();

  if (task.lead) {
    let nextDate = null;
    if (nextFollowUpAt) {
      nextDate = new Date(nextFollowUpAt);
      const leadDoc = await Lead.findById(task.lead);
      await Task.create({
        title: `Next follow-up with ${leadDoc?.fullName || "lead"}`,
        lead: task.lead,
        assignedTo: task.assignedTo || req.user._id,
        createdBy: req.user._id,
        type: task.type || "Call",
        priority: task.priority || "Medium",
        dueAt: nextDate,
        status: "Pending",
      });
    } else {
      const nextPending = await Task.findOne({
        lead: task.lead,
        status: "Pending",
        _id: { $ne: task._id },
      }).sort({ dueAt: 1 });
      nextDate = nextPending ? nextPending.dueAt : null;
    }

    await Lead.findByIdAndUpdate(task.lead, {
      nextFollowUpAt: nextDate,
      lastContactedAt: new Date(),
    });

    // Log activity on the lead
    await Activity.create({
      lead: task.lead,
      createdBy: req.user._id,
      type: "note",
      summary: `Completed task: '${task.title}'${nextDate ? `. Next follow-up scheduled for ${nextDate.toLocaleString()}` : ""}`,
    });
  }

  res.status(200).json({
    success: true,
    message: "Task marked as completed",
    task,
  });
});

// @desc    Cancel task
// @route   PATCH /api/tasks/:taskId/cancel
// @access  Private
const cancelTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;

  const query = { _id: taskId, ...getTaskAccessQuery(req.user) };
  const task = await Task.findOne(query);

  if (!task) {
    return res.status(404).json({ success: false, message: "Task not found." });
  }

  task.status = "Cancelled";
  await task.save();

  if (task.lead) {
    const nextPending = await Task.findOne({
      lead: task.lead,
      status: "Pending",
      _id: { $ne: task._id },
    }).sort({ dueAt: 1 });

    await Lead.findByIdAndUpdate(task.lead, {
      nextFollowUpAt: nextPending ? nextPending.dueAt : null,
    });
  }

  res.status(200).json({
    success: true,
    message: "Task cancelled",
    task,
  });
});

// @desc    Delete task
// @route   DELETE /api/tasks/:taskId
// @access  Private
const deleteTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;

  const query = { _id: taskId, ...getTaskAccessQuery(req.user) };
  const task = await Task.findOneAndDelete(query);

  if (!task) {
    return res.status(404).json({ success: false, message: "Task not found." });
  }

  if (task.lead) {
    const nextPending = await Task.findOne({
      lead: task.lead,
      status: "Pending",
    }).sort({ dueAt: 1 });

    await Lead.findByIdAndUpdate(task.lead, {
      nextFollowUpAt: nextPending ? nextPending.dueAt : null,
    });
  }

  res.status(200).json({
    success: true,
    message: "Task deleted successfully",
  });
});

module.exports = {
  getTasks,
  createTask,
  updateTask,
  rescheduleTask,
  skipTask,
  completeTask,
  cancelTask,
  deleteTask,
};
