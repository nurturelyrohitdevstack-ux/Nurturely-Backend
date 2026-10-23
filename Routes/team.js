const express = require("express");
const router = express.Router();
const {
  getTeamMembers,
  createTeamMember,
  updateTeamMember,
  toggleTeamMemberStatus,
} = require("../Controllers/teamController");
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");

// Team management is restricted to Admins
router.use(protect);
router.use(authorize("admin"));

router.route("/").get(getTeamMembers).post(createTeamMember);

router.route("/:userId").patch(updateTeamMember);
router.patch("/:userId/status", toggleTeamMemberStatus);

module.exports = router;
