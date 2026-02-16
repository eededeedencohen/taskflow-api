const Note = require('../models/Note');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

exports.getNotes = catchAsync(async (req, res) => {
  const notes = await Note.find({ task: req.params.taskId }).sort('createdAt');
  res.status(200).json({ status: 'success', data: { notes } });
});

exports.createNote = catchAsync(async (req, res) => {
  const note = await Note.create({
    task: req.params.taskId,
    author: req.user._id,
    text: req.body.text,
  });

  // Populate the author for the response
  await note.populate({ path: 'author', select: 'name' });

  res.status(201).json({ status: 'success', data: { note } });
});
