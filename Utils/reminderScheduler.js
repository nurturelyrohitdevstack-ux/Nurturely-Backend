const cron = require("node-cron");
const Task = require("../Modals/Task");
const { sendTaskReminderEmail } = require("./mailer");

let taskCron = null;

const checkAndSendReminders = async () => {
  try {
    const now = new Date();
    // Look ahead 30 minutes
    const reminderWindow = new Date(now.getTime() + 30 * 60 * 1000);

    const dueTasks = await Task.find({
      status: "Pending",
      reminderSent: false,
      dueAt: { $gte: now, $lte: reminderWindow },
    })
      .populate("lead", "fullName email company")
      .populate("assignedTo", "fullName email");

    if (!dueTasks || dueTasks.length === 0) {
      return;
    }

    console.log(`⏰ [ReminderScheduler] Processing ${dueTasks.length} pending reminder(s)...`);

    for (const task of dueTasks) {
      if (!task.assignedTo?.email) continue;

      try {
        await sendTaskReminderEmail({
          to: task.assignedTo.email,
          leadName: task.lead?.fullName || "Lead",
          taskTitle: task.title,
          dueAt: task.dueAt,
          representativeName: task.assignedTo.fullName,
        });

        task.reminderSent = true;
        task.reminderAttemptedAt = new Date();
        task.reminderStatus = "sent";
        await task.save();
      } catch (err) {
        console.error(`❌ [ReminderScheduler] Failed to dispatch reminder for task ${task._id}:`, err.message);
        task.reminderAttemptedAt = new Date();
        task.reminderStatus = "failed";
        await task.save();
      }
    }
  } catch (error) {
    // Gracefully handle db disconnects or missing collections
  }
};

const initReminderScheduler = () => {
  if (taskCron) return;

  // Run every 5 minutes: '*/5 * * * *'
  taskCron = cron.schedule("*/5 * * * *", () => {
    checkAndSendReminders();
  });

  console.log("⏱️ [ReminderScheduler] Follow-up task scheduler initialized (every 5 minutes)");
};

const stopReminderScheduler = () => {
  if (taskCron) {
    taskCron.stop();
    taskCron = null;
    console.log("🛑 [ReminderScheduler] Scheduler stopped");
  }
};

module.exports = {
  initReminderScheduler,
  stopReminderScheduler,
  checkAndSendReminders,
};
