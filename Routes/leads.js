const express = require("express");
const router = express.Router();
const {
  getLeads,
  getLeadById,
  createLead,
  updateLead,
  updateLeadStatus,
  assignLead,
  deleteLead,
} = require("../Controllers/leadsController");
const {
  getActivitiesByLead,
  createActivity,
} = require("../Controllers/activitiesController");
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");

// All lead routes require authentication
router.use(protect);

router.route("/").get(getLeads).post(createLead);

router
  .route("/:leadId")
  .get(getLeadById)
  .patch(updateLead)
  .delete(authorize("admin"), deleteLead);

router.patch("/:leadId/status", updateLeadStatus);
router.patch("/:leadId/assign", authorize("admin"), assignLead);

// Nested activity routes for lead
router
  .route("/:leadId/activities")
  .get(getActivitiesByLead)
  .post(createActivity);

module.exports = router;
