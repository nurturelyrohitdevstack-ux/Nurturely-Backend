require("dotenv").config({ path: __dirname + "/../.env" });
const mongoose = require("mongoose");
const User = require("../Modals/User");
const Lead = require("../Modals/Lead");
const Activity = require("../Modals/Activity");
const Task = require("../Modals/Task");

const cleanData = async () => {
  const uri = process.env.Mongoose_uri;
  if (!uri) {
    console.error("❌ Mongoose_uri not set in .env");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log("Connected to MongoDB for data cleanup...");

    const leadsCount = await Lead.countDocuments();
    const actsCount = await Activity.countDocuments();
    const tasksCount = await Task.countDocuments();
    const usersCount = await User.countDocuments();

    console.log(`Current counts: ${leadsCount} leads, ${actsCount} activities, ${tasksCount} tasks, ${usersCount} users.`);

    // Delete all leads, activities, and tasks
    await Lead.deleteMany({});
    await Activity.deleteMany({});
    await Task.deleteMany({});

    console.log("✅ Successfully deleted all Leads, Activities, and Tasks.");

    const remainingUsers = await User.find({}, "fullName email role");
    console.log("Users preserved in database:", remainingUsers);

    process.exit(0);
  } catch (err) {
    console.error("❌ Cleanup error:", err);
    process.exit(1);
  }
};

cleanData();
