const mongoose = require("mongoose");

let isConnected = false;

const mongooseConnectToDb = async () => {
  const uri = process.env.Mongoose_uri;

  if (!uri || uri.trim() === "") {
    console.warn(
      "\n⚠️ [Nurturely Backend] Notice: 'Mongoose_uri' is not configured yet in /home/rohit/nurturely-backend/.env\n" +
      "👉 Please paste your MongoDB Atlas URI or local connection string in .env to persist leads & CRM data.\n" +
      "ℹ️ The HTTP server will run in preview/standby mode so you can test routes and UI.\n"
    );
    return false;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log(`✅ [MongoDB] Connected successfully to host: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.error("❌ [MongoDB] Connection error:", error.message || error);
    console.warn("⚠️ Verify your MongoDB Atlas IP access list (0.0.0.0/0 allowed or current WSL IP) and user credentials in .env");
    return false;
  }
};

const getDbStatus = () => ({
  isConnected,
  readyState: mongoose.connection.readyState,
});

module.exports = { mongooseConnectToDb, getDbStatus };
