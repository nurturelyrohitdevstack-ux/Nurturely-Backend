const mongoose = require("mongoose");
const Task = require("../Modals/Task");
const Lead = require("../Modals/Lead");
const Activity = require("../Modals/Activity");
const asyncHandler = require("../Utils/asyncHandler");

// Helper for task query boundary
const getTaskAccessQuery = (user) => {
  if (user.role === "admin") return {};
  return {
    $or: [{ assignedTo: user._id }, { createdBy: user._id }],
  };
};

// @desc    Get tasks with tab filters (today, upcoming, overdue, completed)
// @route   GET /api/tasks
// @access  Private
const getTasks = asyncHandler(async (req, res) => {
  const { filter = "all", leadId, assignedTo, status } = req.query;

  const query = { ...getTaskAccessQuery(req.user) };

  if (leadId && mongoose.Types.ObjectId.isValid(leadId)) {
    query.lead = leadId;
  }

  if (assignedTo && assignedTo !== "all" && req.user.role === "admin") {
    if (mongoose.Types.ObjectId.isValid(assignedTo)) {
      query.assignedTo = assignedTo;
    }
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

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
  } else if (status && status !== "all") {
    query.status = status;
  }

  const tasks = await Task.find(query)
    .populate("lead", "fullName company email phone status")
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

  // Update lead's next follow-up date if this task is upcoming
  if (!lead.nextFollowUpAt || new Date(dueAt) < new Date(lead.nextFollowUpAt)) {
    lead.nextFollowUpAt = new Date(dueAt);
    await lead.save();
  }

  // Record activity
  await Activity.create({
    lead: leadId,
    createdBy: req.user._id,
    type: "note",
    summary: `Scheduled task: '${task.title}' for ${new Date(dueAt).toLocaleDateString()}`,
  });

  const populatedTask = await Task.findById(task._id)
    .populate("lead", "fullName company email phone")
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

  if (req.body.status === "Completed" && !task.completedAt) {
    task.completedAt = new Date();
  }

  await task.save();

  const populatedTask = await Task.findById(task._id)
    .populate("lead", "fullName company")
    .populate("assignedTo", "fullName email");

  res.status(200).json({
    success: true,
    message: "Task updated successfully",
    task: populatedTask,
  });
});

// @desc    Mark task as completed
// @route   PATCH /api/tasks/:taskId/complete
// @access  Private
const completeTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;

  const query = { _id: taskId, ...getTaskAccessQuery(req.user) };
  const task = await Task.findOne(query);

  if (!task) {
    return res.status(404).json({ success: false, message: "Task not found." });
  }

  task.status = "Completed";
  task.completedAt = new Date();
  await task.save();

  // Log activity on the lead
  await Activity.create({
    lead: task.lead,
    createdBy: req.user._id,
    type: "note",
    summary: `Completed task: '${task.title}'`,
  });

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

  res.status(200).json({
    success: true,
    message: "Task deleted successfully",
  });
});

module.exports = {
  getTasks,
  createTask,
  updateTask,
  completeTask,
  cancelTask,
  deleteTask,
};
