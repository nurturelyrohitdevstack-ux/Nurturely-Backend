const Task = require("../Modals/Task");
const Lead = require("../Modals/Lead");

/**
 * Synchronizes follow-ups from Lead documents into Task documents.
 * Ensures that any active lead with nextFollowUpAt (and not Won/Lost) has a matching pending Task.
 */
const syncLeadFollowUps = async (user) => {
  try {
    const leadQuery = {
      nextFollowUpAt: { $ne: null },
      status: { $nin: ["Won", "Lost"] },
    };

    if (user && user.role !== "admin") {
      leadQuery.$or = [{ assignedTo: user._id }, { createdBy: user._id }];
    }

    const leads = await Lead.find(leadQuery);

    for (const lead of leads) {
      if (!lead.nextFollowUpAt) continue;

      // Find existing pending task for this lead
      const existingTask = await Task.findOne({
        lead: lead._id,
        status: "Pending",
      });

      if (!existingTask) {
        // Create follow-up task
        await Task.create({
          title: `Follow-up with ${lead.fullName}`,
          lead: lead._id,
          assignedTo: lead.assignedTo || lead.createdBy || user?._id,
          createdBy: lead.createdBy || user?._id,
          type: "Call",
          priority: lead.priority || "Medium",
          dueAt: lead.nextFollowUpAt,
          notes: lead.requirements ? `Scope: ${lead.requirements.slice(0, 150)}` : "",
          status: "Pending",
        });
      } else {
        // If dueAt is out of sync with lead.nextFollowUpAt, update it
        const taskTime = new Date(existingTask.dueAt).getTime();
        const leadTime = new Date(lead.nextFollowUpAt).getTime();
        if (taskTime !== leadTime) {
          existingTask.dueAt = lead.nextFollowUpAt;
          await existingTask.save();
        }
      }
    }
  } catch (err) {
    console.error("Error during lead follow-up task sync:", err);
  }
};

/**
 * Calculates start and end of "Today" taking into account client timezone offset (in minutes).
 */
const getTodayRange = (tzOffsetMinutes) => {
  const now = new Date();
  if (tzOffsetMinutes !== undefined && tzOffsetMinutes !== null && !isNaN(Number(tzOffsetMinutes))) {
    // Client offset in minutes (e.g. IST is -330)
    // Client local time = UTC time - offset * 60000
    const offsetMs = Number(tzOffsetMinutes) * 60 * 1000;
    const clientNow = new Date(now.getTime() - offsetMs);
    const startClient = new Date(
      Date.UTC(
        clientNow.getUTCFullYear(),
        clientNow.getUTCMonth(),
        clientNow.getUTCDate(),
        0,
        0,
        0,
        0
      )
    );
    const endClient = new Date(
      Date.UTC(
        clientNow.getUTCFullYear(),
        clientNow.getUTCMonth(),
        clientNow.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );
    return {
      startOfToday: new Date(startClient.getTime() + offsetMs),
      endOfToday: new Date(endClient.getTime() + offsetMs),
    };
  }
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  );
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  );
  return { startOfToday, endOfToday };
};

module.exports = {
  syncLeadFollowUps,
  getTodayRange,
};
