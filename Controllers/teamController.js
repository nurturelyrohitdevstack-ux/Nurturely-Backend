const User = require("../Modals/User");
const Lead = require("../Modals/Lead");
const Task = require("../Modals/Task");
const asyncHandler = require("../Utils/asyncHandler");

// @desc    Get all team members with workload stats
// @route   GET /api/team
// @access  Private (Admin only)
const getTeamMembers = asyncHandler(async (req, res) => {
  const users = await User.find({})
    .select("-password -resetPasswordToken -resetPasswordExpire")
    .sort({ createdAt: -1 })
    .lean();

  // Aggregate member workloads
  const [leadsCountByAssignee, wonCountByAssignee, tasksCountByAssignee] = await Promise.all([
    Lead.aggregate([
      { $match: { assignedTo: { $ne: null } } },
      { $group: { _id: "$assignedTo", count: { $sum: 1 } } },
    ]),
    Lead.aggregate([
      { $match: { assignedTo: { $ne: null }, status: "Won" } },
      { $group: { _id: "$assignedTo", count: { $sum: 1 } } },
    ]),
    Task.aggregate([
      { $match: { status: "Pending" } },
      { $group: { _id: "$assignedTo", count: { $sum: 1 } } },
    ]),
  ]);

  const leadMap = new Map(leadsCountByAssignee.map((item) => [String(item._id), item.count]));
  const wonMap = new Map(wonCountByAssignee.map((item) => [String(item._id), item.count]));
  const taskMap = new Map(tasksCountByAssignee.map((item) => [String(item._id), item.count]));

  const team = users.map((user) => {
    const userId = String(user._id);
    return {
      ...user,
      stats: {
        assignedLeads: leadMap.get(userId) || 0,
        wonLeads: wonMap.get(userId) || 0,
        pendingTasks: taskMap.get(userId) || 0,
      },
    };
  });

  res.status(200).json({
    success: true,
    team,
  });
});

// @desc    Create / add a new team member
// @route   POST /api/team
// @access  Private (Admin only)
const createTeamMember = asyncHandler(async (req, res) => {
  const { fullName, email, password, role = "sales", phone } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Full name, email, and temporary password are required.",
    });
  }

  const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: "A team member with this email address already exists.",
    });
  }

  const newUser = await User.create({
    fullName: fullName.trim(),
    email: email.toLowerCase().trim(),
    password,
    role: ["admin", "sales"].includes(role) ? role : "sales",
    phone: phone ? phone.trim() : "",
    isActive: true,
  });

  res.status(201).json({
    success: true,
    message: `Team member ${newUser.fullName} added successfully.`,
    user: newUser,
  });
});

// @desc    Update team member details or role
// @route   PATCH /api/team/:userId
// @access  Private (Admin only)
const updateTeamMember = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { fullName, role, phone, isActive } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found." });
  }

  // Prevent demoting the last active Admin
  if (user.role === "admin" && role === "sales") {
    const adminCount = await User.countDocuments({ role: "admin", isActive: true });
    if (adminCount <= 1) {
      return res.status(400).json({
        success: false,
        message: "Cannot demote the only remaining active Administrator.",
      });
    }
  }

  if (fullName) user.fullName = fullName.trim();
  if (role && ["admin", "sales"].includes(role)) user.role = role;
  if (phone !== undefined) user.phone = phone.trim();
  if (isActive !== undefined) user.isActive = Boolean(isActive);

  await user.save();

  res.status(200).json({
    success: true,
    message: "Team member updated successfully",
    user,
  });
});

// @desc    Toggle team member active status
// @route   PATCH /api/team/:userId/status
// @access  Private (Admin only)
const toggleTeamMemberStatus = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found." });
  }

  // Prevent deactivating oneself or last active admin
  if (String(user._id) === String(req.user._id)) {
    return res.status(400).json({
      success: false,
      message: "You cannot deactivate your own account.",
    });
  }

  if (user.role === "admin" && user.isActive) {
    const adminCount = await User.countDocuments({ role: "admin", isActive: true });
    if (adminCount <= 1) {
      return res.status(400).json({
        success: false,
        message: "Cannot deactivate the only remaining active Administrator.",
      });
    }
  }

  user.isActive = !user.isActive;
  await user.save();

  res.status(200).json({
    success: true,
    message: `Team member ${user.isActive ? "activated" : "deactivated"} successfully`,
    user,
  });
});

module.exports = {
  getTeamMembers,
  createTeamMember,
  updateTeamMember,
  toggleTeamMemberStatus,
};
