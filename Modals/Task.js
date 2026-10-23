const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
      maxlength: [150, "Task title cannot exceed 150 characters"],
    },
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      required: [true, "Associated lead is required"],
      index: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Assigned representative is required"],
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator reference is required"],
    },
    type: {
      type: String,
      enum: {
        values: ["Call", "Email", "Meeting", "Other"],
        message: "{VALUE} is not a valid task type",
      },
      default: "Call",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    dueAt: {
      type: Date,
      required: [true, "Due date and time is required"],
      index: true,
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },
    status: {
      type: String,
      enum: {
        values: ["Pending", "Completed", "Cancelled"],
        message: "{VALUE} is not a valid task status",
      },
      default: "Pending",
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    reminderSent: {
      type: Boolean,
      default: false,
    },
    reminderAttemptedAt: {
      type: Date,
      default: null,
    },
    reminderStatus: {
      type: String,
      enum: ["none", "sent", "failed"],
      default: "none",
    },
  },
  {
    timestamps: true,
  }
);

taskSchema.index({ assignedTo: 1, dueAt: 1, status: 1 });

module.exports = mongoose.models.Task || mongoose.model("Task", taskSchema);
