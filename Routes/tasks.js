const express = require("express");
const router = express.Router();
const {
  getTasks,
  createTask,
  updateTask,
  rescheduleTask,
  skipTask,
  completeTask,
  cancelTask,
  deleteTask,
} = require("../Controllers/tasksController");
const protect = require("../Middleware/protect");

router.use(protect);

router.route("/").get(getTasks).post(createTask);

router.route("/:taskId").patch(updateTask).delete(deleteTask);

router.patch("/:taskId/complete", completeTask);
router.patch("/:taskId/cancel", cancelTask);
router.patch("/:taskId/reschedule", rescheduleTask);
router.patch("/:taskId/skip", skipTask);

module.exports = router;
