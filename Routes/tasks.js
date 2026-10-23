const express = require("express");
const router = express.Router();
const {
  getTasks,
  createTask,
  updateTask,
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

module.exports = router;
