const Template = require("../Modals/Template");

// @desc    Get all templates (user's custom + system defaults)
// @route   GET /api/templates
// @access  Private
exports.getTemplates = async (req, res, next) => {
  try {
    const templates = await Template.find({
      $or: [{ createdBy: req.user._id }, { isDefault: true }],
    }).sort({ isDefault: 1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: templates.length,
      templates,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create a custom template
// @route   POST /api/templates
// @access  Private
exports.createTemplate = async (req, res, next) => {
  try {
    const {
      name,
      badge,
      estimatedValue,
      currency,
      priority,
      status,
      source,
      tags,
      requirements,
      followUpPreset,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Template name is required",
      });
    }

    const template = await Template.create({
      name: name.trim(),
      badge: badge?.trim() || "Custom",
      estimatedValue: Number(estimatedValue) || 0,
      currency: currency || "INR",
      priority: priority || "Medium",
      status: status || "New",
      source: source || "Website",
      tags: Array.isArray(tags) ? tags : [],
      requirements: requirements?.trim() || "",
      followUpPreset: followUpPreset || "1d",
      createdBy: req.user._id,
      isDefault: false,
    });

    res.status(201).json({
      success: true,
      message: `Template "${template.name}" saved successfully!`,
      template,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete a custom template
// @route   DELETE /api/templates/:templateId
// @access  Private
exports.deleteTemplate = async (req, res, next) => {
  try {
    const { templateId } = req.params;

    const template = await Template.findById(templateId);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Template not found",
      });
    }

    // Only allow creator or admin to delete
    if (
      template.createdBy &&
      template.createdBy.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this template",
      });
    }

    await Template.findByIdAndDelete(templateId);

    res.status(200).json({
      success: true,
      message: `Template "${template.name}" deleted`,
    });
  } catch (err) {
    next(err);
  }
};
