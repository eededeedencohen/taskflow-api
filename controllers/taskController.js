const Task = require('../models/Task');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

exports.getAllTasks = catchAsync(async (req, res) => {
  const filter = {};

  if (req.query.status) filter.status = req.query.status;
  if (req.query.shape) filter.shape = req.query.shape;
  if (req.query.search) {
    const searchRegex = new RegExp(req.query.search, 'i');
    filter.$or = [{ name: searchRegex }, { description: searchRegex }];
  }
  if (req.query.startDate || req.query.endDate) {
    filter.deadline = {};
    if (req.query.startDate) filter.deadline.$gte = new Date(req.query.startDate);
    if (req.query.endDate) filter.deadline.$lte = new Date(req.query.endDate);
  }

  const tasks = await Task.find(filter).populate('dependencies', 'name status');
  res.status(200).json({ status: 'success', data: { tasks } });
});

exports.getTask = catchAsync(async (req, res, next) => {
  const task = await Task.findById(req.params.id).populate(
    'dependencies',
    'name status subtasks'
  );
  if (!task) return next(new AppError('No task found with that ID', 404));
  res.status(200).json({ status: 'success', data: { task } });
});

exports.createTask = catchAsync(async (req, res) => {
  req.body.createdBy = req.user._id;
  const task = await Task.create(req.body);
  res.status(201).json({ status: 'success', data: { task } });
});

exports.updateTask = catchAsync(async (req, res, next) => {
  const task = await Task.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  }).populate('dependencies', 'name status');

  if (!task) return next(new AppError('No task found with that ID', 404));
  res.status(200).json({ status: 'success', data: { task } });
});

exports.deleteTask = catchAsync(async (req, res, next) => {
  const task = await Task.findByIdAndDelete(req.params.id);
  if (!task) return next(new AppError('No task found with that ID', 404));

  // Remove this task from all other tasks' dependencies
  await Task.updateMany(
    { dependencies: req.params.id },
    { $pull: { dependencies: req.params.id } }
  );

  res.status(204).json({ status: 'success', data: null });
});

exports.toggleSubtask = catchAsync(async (req, res, next) => {
  const task = await Task.findById(req.params.id);
  if (!task) return next(new AppError('No task found with that ID', 404));

  const subtask = task.subtasks.id(req.params.subtaskId);
  if (!subtask) return next(new AppError('No subtask found with that ID', 404));

  subtask.isCompleted = !subtask.isCompleted;

  // Auto-update task status based on progress
  const total = task.subtasks.length;
  const done = task.subtasks.filter((s) => s.isCompleted).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  if (progress === 100 && total > 0) {
    task.status = 'Completed';
  } else if (progress > 0) {
    task.status = 'In Progress';
  }

  await task.save();

  const populated = await Task.findById(task._id).populate(
    'dependencies',
    'name status subtasks'
  );
  res.status(200).json({ status: 'success', data: { task: populated } });
});

exports.updateSubtask = catchAsync(async (req, res, next) => {
  // Load current state to make decisions
  const task = await Task.findById(req.params.id);
  if (!task) return next(new AppError('No task found with that ID', 404));

  const subtask = task.subtasks.id(req.params.subtaskId);
  if (!subtask) return next(new AppError('No subtask found with that ID', 404));

  const { priority, estimatedHours, boardStatus, addNote } = req.body;

  // Build atomic $set operations on the matched subdocument
  const setOps = {};

  if (priority !== undefined) setOps['subtasks.$.priority'] = priority || null;
  if (estimatedHours !== undefined) setOps['subtasks.$.estimatedHours'] = estimatedHours;

  if (boardStatus !== undefined) {
    setOps['subtasks.$.boardStatus'] = boardStatus || null;
    if (boardStatus === 'done') {
      setOps['subtasks.$.isCompleted'] = true;
    } else if (boardStatus && subtask.isCompleted) {
      setOps['subtasks.$.isCompleted'] = false;
    }
  }

  // Build the update query
  const update = {};
  if (Object.keys(setOps).length) update.$set = setOps;
  if (addNote) update.$push = { 'subtasks.$.notes': { text: addNote, createdAt: new Date() } };

  // Apply atomic update (no full-document validation)
  if (Object.keys(update).length) {
    await Task.findOneAndUpdate(
      { _id: req.params.id, 'subtasks._id': req.params.subtaskId },
      update
    );
  }

  // Reload to compute auto-status
  const updated = await Task.findById(req.params.id);
  const total = updated.subtasks.length;
  const done = updated.subtasks.filter((s) => s.isCompleted).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  if (progress === 100 && total > 0 && updated.status !== 'Completed') {
    await Task.findByIdAndUpdate(req.params.id, { status: 'Completed' });
  } else if (progress > 0 && progress < 100 && updated.status !== 'In Progress') {
    await Task.findByIdAndUpdate(req.params.id, { status: 'In Progress' });
  }

  const populated = await Task.findById(req.params.id).populate(
    'dependencies',
    'name status subtasks'
  );
  res.status(200).json({ status: 'success', data: { task: populated } });
});

exports.updatePosition = catchAsync(async (req, res, next) => {
  const { x, y } = req.body;
  const task = await Task.findByIdAndUpdate(
    req.params.id,
    { position: { x, y } },
    { new: true }
  );
  if (!task) return next(new AppError('No task found with that ID', 404));
  res.status(200).json({ status: 'success', data: { task } });
});

exports.bulkUpdatePositions = catchAsync(async (req, res) => {
  const { positions } = req.body; // [{ id, x, y }, ...]
  const bulkOps = positions.map((p) => ({
    updateOne: {
      filter: { _id: p.id },
      update: { position: { x: p.x, y: p.y } },
    },
  }));
  await Task.bulkWrite(bulkOps);
  res.status(200).json({ status: 'success', message: 'Positions updated' });
});

exports.bulkUpdateGroupNames = catchAsync(async (req, res) => {
  const { taskIds, groupName } = req.body;
  await Task.updateMany(
    { _id: { $in: taskIds } },
    { $set: { groupName } }
  );
  res.status(200).json({ status: 'success', message: 'Group names updated' });
});

exports.addDependency = catchAsync(async (req, res, next) => {
  const { dependencyId } = req.body;
  const task = await Task.findById(req.params.id);
  if (!task) return next(new AppError('No task found with that ID', 404));

  if (!task.dependencies.includes(dependencyId)) {
    task.dependencies.push(dependencyId);
    await task.save();
  }

  const populated = await Task.findById(task._id).populate(
    'dependencies',
    'name status'
  );
  res.status(200).json({ status: 'success', data: { task: populated } });
});

exports.removeDependency = catchAsync(async (req, res, next) => {
  const task = await Task.findByIdAndUpdate(
    req.params.id,
    { $pull: { dependencies: req.params.depId } },
    { new: true }
  ).populate('dependencies', 'name status');

  if (!task) return next(new AppError('No task found with that ID', 404));
  res.status(200).json({ status: 'success', data: { task } });
});
