const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      required: [true, "Lead reference is required"],
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator reference is required"],
      index: true,
    },
    type: {
      type: String,
      enum: {
        values: [
          "note",
          "call",
          "email",
          "meeting",
          "status_change",
          "assignment_change",
          "other",
        ],
        message: "{VALUE} is not a valid activity type",
      },
      default: "note",
      index: true,
    },
    summary: {
      type: String,
      required: [true, "Activity summary is required"],
      trim: true,
      maxlength: [300, "Summary cannot exceed 300 characters"],
    },
    details: {
      type: String,
      trim: true,
      default: "",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

activitySchema.index({ lead: 1, createdAt: -1 });

module.exports =
  mongoose.models.Activity || mongoose.model("Activity", activitySchema);
