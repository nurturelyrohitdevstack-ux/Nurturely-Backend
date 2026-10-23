const express = require("express");
const router = express.Router();
const {
  getTemplates,
  createTemplate,
  deleteTemplate,
} = require("../Controllers/templatesController");
const protect = require("../Middleware/protect");

router.use(protect);

router.route("/").get(getTemplates).post(createTemplate);
router.route("/:templateId").delete(deleteTemplate);

module.exports = router;
