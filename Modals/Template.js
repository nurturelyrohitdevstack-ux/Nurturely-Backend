const mongoose = require("mongoose");

const templateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Template name is required"],
      trim: true,
      maxlength: [100, "Template name cannot exceed 100 characters"],
    },
    badge: {
      type: String,
      trim: true,
      default: "Custom",
    },
    estimatedValue: {
      type: Number,
      default: 0,
      min: [0, "Estimated value cannot be negative"],
    },
    currency: {
      type: String,
      default: "INR",
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },
    status: {
      type: String,
      default: "New",
    },
    source: {
      type: String,
      default: "Website",
    },
    tags: {
      type: [String],
      default: [],
    },
    requirements: {
      type: String,
      trim: true,
      default: "",
    },
    followUpPreset: {
      type: String,
      enum: ["none", "today", "1d", "2d", "3d", "7d", "custom"],
      default: "1d",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.Template || mongoose.model("Template", templateSchema);
