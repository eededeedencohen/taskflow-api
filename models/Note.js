const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: [true, 'Note must belong to a task'],
    index: true,
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Note must have an author'],
  },
  text: {
    type: String,
    required: [true, 'Note text cannot be empty'],
    trim: true,
    maxlength: 2000,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

noteSchema.pre(/^find/, function (next) {
  this.populate({ path: 'author', select: 'name' });
  next();
});

module.exports = mongoose.model('Note', noteSchema);
