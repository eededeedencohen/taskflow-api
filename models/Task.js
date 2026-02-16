const mongoose = require('mongoose');

const subtaskSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  isCompleted: { type: Boolean, default: false },
});

const taskSchema = new mongoose.Schema(
  {
    legacyId: { type: Number },
    name: {
      type: String,
      required: [true, 'Task name is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'In Progress', 'Completed', 'Stuck'],
      default: 'Pending',
    },
    description: { type: String, default: '' },
    deadline: { type: Date },
    startDate: { type: Date },
    endDate: { type: Date },
    dependencies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task',
      },
    ],
    subtasks: [subtaskSchema],
    shape: {
      type: String,
      enum: ['box', 'ellipse', 'diamond', 'database'],
      default: 'box',
    },
    estimatedHours: { type: Number, default: 0 },
    position: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

taskSchema.virtual('progress').get(function () {
  if (!this.subtasks || this.subtasks.length === 0) return 0;
  const done = this.subtasks.filter((s) => s.isCompleted).length;
  return Math.round((done / this.subtasks.length) * 100);
});

taskSchema.set('toJSON', { virtuals: true });
taskSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Task', taskSchema);
