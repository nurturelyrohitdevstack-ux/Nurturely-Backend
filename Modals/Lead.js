const mongoose = require("mongoose");

const leadSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Lead full name is required"],
      trim: true,
      maxlength: [120, "Lead name cannot exceed 120 characters"],
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    company: {
      type: String,
      trim: true,
      default: "",
    },
    jobTitle: {
      type: String,
      trim: true,
      default: "",
    },
    source: {
      type: String,
      trim: true,
      default: "Website",
    },
    status: {
      type: String,
      enum: {
        values: [
          "New",
          "Contacted",
          "Meeting Scheduled",
          "Qualified",
          "Proposal Sent",
          "Proposal",
          "In Negotiation",
          "Won",
          "Lost",
          "On Hold",
        ],
        message: "{VALUE} is not a valid lead stage",
      },
      default: "New",
      index: true,
    },
    priority: {
      type: String,
      enum: {
        values: ["Low", "Medium", "High"],
        message: "{VALUE} is not a valid priority",
      },
      default: "Medium",
      index: true,
    },
    estimatedValue: {
      type: Number,
      min: [0, "Estimated value cannot be negative"],
      default: 0,
    },
    currency: {
      type: String,
      default: "INR",
      trim: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator reference is required"],
      index: true,
    },
    requirements: {
      type: String,
      trim: true,
      default: "",
    },
    tags: {
      type: [String],
      default: [],
    },
    lastContactedAt: {
      type: Date,
      default: null,
    },
    nextFollowUpAt: {
      type: Date,
      default: null,
      index: true,
    },
    lostReason: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

leadSchema.index({ email: 1, phone: 1 });
leadSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Lead || mongoose.model("Lead", leadSchema);
