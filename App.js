const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const helmet = require("helmet");
const errorHandler = require("./Middleware/errorHandler");
const { getDbStatus } = require("./Config/db");

const app = express();
app.set("trust proxy", 1);

// Allowed frontend origins (supports local Next.js dev on 3000, 3001, 3002, etc.)
const allowedOrigins = [
  process.env.Frontend_Url,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        process.env.NODE_ENV !== "production"
      ) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy blocks origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

if (process.env.NODE_ENV === "production") {
  app.use(morgan("combined"));
} else {
  app.use(morgan("dev"));
}

app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Health and Diagnostics Endpoint
app.get("/health", (req, res) => {
  const dbStatus = getDbStatus();
  res.status(200).json({
    status: "ok",
    service: "Nurturely CRM Backend",
    timestamp: new Date().toISOString(),
    database: dbStatus.isConnected ? "connected" : "disconnected / standby",
  });
});

app.get("/api/health", (req, res) => {
  const dbStatus = getDbStatus();
  res.status(200).json({
    status: "ok",
    service: "Nurturely CRM Backend",
    timestamp: new Date().toISOString(),
    database: dbStatus.isConnected ? "connected" : "disconnected / standby",
  });
});

// Primary CRM Routes
app.use("/api/auth", require("./Routes/auth"));
app.use("/api/leads", require("./Routes/leads"));
app.use("/api/activities", require("./Routes/activities"));
app.use("/api/tasks", require("./Routes/tasks"));
app.use("/api/dashboard", require("./Routes/dashboard"));
app.use("/api/team", require("./Routes/team"));
app.use("/api/templates", require("./Routes/templates"));

// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.originalUrl} not found on Nurturely server.`,
  });
});

// Centralized Error Handler
app.use(errorHandler);

module.exports = app;
