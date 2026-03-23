const express = require('express');
const taskController = require('../controllers/taskController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.post('/positions', taskController.bulkUpdatePositions);
router.post('/group-names', taskController.bulkUpdateGroupNames);

router
  .route('/')
  .get(taskController.getAllTasks)
  .post(taskController.createTask);

router
  .route('/:id')
  .get(taskController.getTask)
  .patch(taskController.updateTask)
  .delete(taskController.deleteTask);

router.patch('/:id/subtasks/:subtaskId', taskController.toggleSubtask);
router.patch('/:id/subtasks/:subtaskId/board', taskController.updateSubtask);
router.patch('/:id/position', taskController.updatePosition);

router
  .route('/:id/dependencies')
  .post(taskController.addDependency);

router.delete('/:id/dependencies/:depId', taskController.removeDependency);

module.exports = router;
