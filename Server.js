require("dotenv").config();
const mongoose = require("mongoose");
const { mongooseConnectToDb } = require("./Config/db");
const app = require("./App");
const {
  initReminderScheduler,
  stopReminderScheduler,
} = require("./Utils/reminderScheduler");

const PORT = process.env.PORT || 5000;

let server;
let isShuttingDown = false;

const shutdown = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("\n🛑 [Nurturely] Shutting down backend gracefully...");

  try {
    stopReminderScheduler();
    if (server) {
      server.close(() => {
        console.log("✅ [Nurturely] HTTP server closed");
      });
    }

    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log("✅ [Nurturely] MongoDB connection closed");
    }
  } catch (err) {
    console.error("❌ [Nurturely] Shutdown error:", err);
  }

  setTimeout(() => {
    console.log("⚠️ [Nurturely] Force shutdown complete");
    process.exit(0);
  }, 3000);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Connect DB and launch HTTP server
(async () => {
  try {
    await mongooseConnectToDb();
  } catch (err) {
    console.warn("⚠️ [Nurturely] Database connection deferred. Please update Mongoose_uri in .env");
  }

  server = app.listen(PORT, () => {
    console.log(`\n🚀 [Nurturely Backend] CRM Server running on port ${PORT}`);
    console.log(`🌐 Base URL: http://localhost:${PORT}`);
    console.log(`🩺 Health check: http://localhost:${PORT}/health`);
    initReminderScheduler();
  });
})();
