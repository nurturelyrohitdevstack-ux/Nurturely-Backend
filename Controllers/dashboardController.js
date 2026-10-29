const mongoose = require("mongoose");
const Lead = require("../Modals/Lead");
const Task = require("../Modals/Task");
const Activity = require("../Modals/Activity");
const asyncHandler = require("../Utils/asyncHandler");
const { syncLeadFollowUps, getTodayRange } = require("../Utils/taskSync");

// Role boundary helper
const getScopeQuery = (user) => {
  if (user.role === "admin") return {};
  return {
    $or: [{ assignedTo: user._id }, { createdBy: user._id }],
  };
};

// @desc    Get CRM dashboard metrics and KPI summaries
// @route   GET /api/dashboard/summary
// @access  Private
const getDashboardSummary = asyncHandler(async (req, res) => {
  // Sync follow-up tasks from active leads
  await syncLeadFollowUps(req.user);

  const scope = getScopeQuery(req.user);

  const now = new Date();
  const { startOfToday, endOfToday } = getTodayRange(req.query.tzOffset);
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Run aggregations and counts in parallel
  const [
    totalLeads,
    newThisMonth,
    leadsByStatusAgg,
    leadsBySourceAgg,
    openDealsAgg,
    wonDealsAgg,
    tasksDueToday,
    tasksOverdue,
    recentActivities,
    upcomingTasks,
  ] = await Promise.all([
    // Total Leads
    Lead.countDocuments(scope),

    // New Leads this month
    Lead.countDocuments({ ...scope, createdAt: { $gte: startOfThisMonth } }),

    // Leads by status
    Lead.aggregate([
      { $match: scope },
      { $group: { _id: "$status", count: { $sum: 1 }, totalValue: { $sum: "$estimatedValue" } } },
    ]),

    // Leads by source
    Lead.aggregate([
      { $match: scope },
      { $group: { _id: "$source", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),

    // Total value of open opportunities
    Lead.aggregate([
      {
        $match: {
          ...scope,
          status: {
            $in: [
              "New",
              "Contacted",
              "Meeting Scheduled",
              "Qualified",
              "Proposal Sent",
              "Proposal",
              "In Negotiation",
            ],
          },
        },
      },
      { $group: { _id: null, total: { $sum: "$estimatedValue" }, count: { $sum: 1 } } },
    ]),

    // Total Won value & count
    Lead.aggregate([
      { $match: { ...scope, status: "Won" } },
      { $group: { _id: null, total: { $sum: "$estimatedValue" }, count: { $sum: 1 } } },
    ]),

    // Tasks due today
    Task.countDocuments({
      ...scope,
      status: "Pending",
      dueAt: { $gte: startOfToday, $lte: endOfToday },
    }),

    // Tasks overdue
    Task.countDocuments({
      ...scope,
      status: "Pending",
      dueAt: { $lt: startOfToday },
    }),

    // Recent 5 activities
    Activity.find({})
      .populate("lead", "fullName company")
      .populate("createdBy", "fullName email")
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),

    // Upcoming 5 tasks
    Task.find({ ...scope, status: "Pending", dueAt: { $gte: startOfToday } })
      .populate("lead", "fullName company requirements")
      .sort({ dueAt: 1 })
      .limit(5)
      .lean(),
  ]);

  // Transform status aggregation into easy map
  const stageCounts = {
    New: 0,
    Contacted: 0,
    "Meeting Scheduled": 0,
    Qualified: 0,
    "Proposal Sent": 0,
    "In Negotiation": 0,
    Won: 0,
    Lost: 0,
    "On Hold": 0,
  };
  leadsByStatusAgg.forEach((item) => {
    const key = item._id === "Proposal" ? "Proposal Sent" : item._id;
    if (stageCounts[key] !== undefined) {
      stageCounts[key] = (stageCounts[key] || 0) + item.count;
    } else {
      stageCounts[item._id] = item.count;
    }
  });

  const openPipelineValue = openDealsAgg[0]?.total || 0;
  const wonPipelineValue = wonDealsAgg[0]?.total || 0;
  const wonCount = stageCounts.Won;
  const lostCount = stageCounts.Lost;
  const closedCount = wonCount + lostCount;

  // Conversion rate formula
  const conversionRate =
    closedCount > 0
      ? Number(((wonCount / closedCount) * 100).toFixed(1))
      : totalLeads > 0
      ? Number(((wonCount / totalLeads) * 100).toFixed(1))
      : 0;

  res.status(200).json({
    success: true,
    metrics: {
      totalLeads,
      newThisMonth,
      openPipelineValue,
      wonPipelineValue,
      wonCount,
      lostCount,
      conversionRate,
      tasksDueToday,
      tasksOverdue,
      stageCounts,
      leadsBySource: leadsBySourceAgg.map((s) => ({
        source: s._id || "Other",
        count: s.count,
      })),
      recentActivities,
      upcomingTasks,
    },
  });
});

// @desc    Get monthly lead creation trend
// @route   GET /api/dashboard/trends
// @access  Private
const getDashboardTrends = asyncHandler(async (req, res) => {
  const scope = getScopeQuery(req.user);

  // Group by month over the past 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const monthlyAgg = await Lead.aggregate([
    {
      $match: {
        ...scope,
        createdAt: { $gte: sixMonthsAgo },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
        },
        count: { $sum: 1 },
        wonCount: {
          $sum: { $cond: [{ $eq: ["$status", "Won"] }, 1, 0] },
        },
        value: { $sum: "$estimatedValue" },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const trends = monthlyAgg.map((item) => ({
    label: `${monthNames[item._id.month - 1]} ${item._id.year}`,
    leads: item.count,
    won: item.wonCount,
    value: item.value,
  }));

  res.status(200).json({
    success: true,
    trends,
  });
});

module.exports = {
  getDashboardSummary,
  getDashboardTrends,
};
