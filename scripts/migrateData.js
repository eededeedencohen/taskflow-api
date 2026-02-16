const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const User = require('../models/User');
const Task = require('../models/Task');
const Note = require('../models/Note');
const connectDB = require('../config/db');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

async function migrate() {
  await connectDB();

  // Clear existing data
  console.log('Clearing existing data...');
  await User.deleteMany({});
  await Task.deleteMany({});
  await Note.deleteMany({});

  // Step 1: Create users
  console.log('\n--- Step 1: Creating users ---');
  const usersData = [
    { name: 'Eden', email: 'eden@taskflow.com', password: 'changeme123' },
    { name: 'Eyal', email: 'eyal@taskflow.com', password: 'changeme123' },
    { name: 'Yakir', email: 'yakir@taskflow.com', password: 'changeme123' },
  ];

  const userMap = {}; // name -> ObjectId
  for (const u of usersData) {
    const user = await User.create(u);
    userMap[u.name] = user._id;
    console.log(`  Created user: ${u.name} (${user._id})`);
  }

  // Step 2: Migrate tasks (first pass - without dependencies)
  console.log('\n--- Step 2: Migrating tasks ---');
  const tasksRaw = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'tasks.json'), 'utf8')
  );

  const legacyToObjectId = {}; // legacyId (number) -> ObjectId
  let skippedDeps = 0;

  for (const t of tasksRaw) {
    const task = await Task.create({
      legacyId: t.TaskID,
      name: t.TaskName || 'Untitled',
      status: t.Status || 'Pending',
      description: t.Description || '',
      deadline: t.DeathLine ? new Date(t.DeathLine) : undefined,
      startDate: t.Start ? new Date(t.Start) : undefined,
      endDate: t.end ? new Date(t.end) : undefined,
      subtasks: (t.subtasks || []).map((s) => ({
        name: s.subTaskName || 'Untitled',
        description: s.Description || '',
        isCompleted: !!s.isCompleted,
      })),
      shape: t.Shape || 'box',
      estimatedHours: parseInt(t.EstimatedHours) || 0,
      position: {
        x: typeof t.x === 'number' ? t.x : 0,
        y: typeof t.y === 'number' ? t.y : 0,
      },
      dependencies: [], // will be set in second pass
      createdBy: userMap['Eden'], // default creator
    });

    legacyToObjectId[t.TaskID] = task._id;
    console.log(`  Created task: ${t.TaskName} (legacy:${t.TaskID} -> ${task._id})`);
  }

  // Step 3: Resolve dependencies (second pass)
  console.log('\n--- Step 3: Resolving dependencies ---');
  for (const t of tasksRaw) {
    if (!t.Dependencies || t.Dependencies.length === 0) continue;

    const validDeps = [];
    for (const depId of t.Dependencies) {
      // Only accept numeric IDs that map to real tasks
      const numericId = typeof depId === 'number' ? depId : parseInt(depId);
      if (!isNaN(numericId) && legacyToObjectId[numericId]) {
        validDeps.push(legacyToObjectId[numericId]);
      } else {
        skippedDeps++;
        console.log(`  Skipped invalid dependency: ${depId} (on task ${t.TaskID})`);
      }
    }

    if (validDeps.length > 0) {
      await Task.findByIdAndUpdate(legacyToObjectId[t.TaskID], {
        dependencies: validDeps,
      });
    }
  }

  // Step 4: Migrate notes
  console.log('\n--- Step 4: Migrating notes ---');
  const notesRaw = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'notes.json'), 'utf8')
  );

  let notesCreated = 0;
  let notesSkipped = 0;

  for (const n of notesRaw) {
    const taskObjId = legacyToObjectId[parseInt(n.TaskID)];
    const authorObjId = userMap[n.Responder];

    if (!taskObjId) {
      console.log(`  Skipped note: task ${n.TaskID} not found`);
      notesSkipped++;
      continue;
    }
    if (!authorObjId) {
      console.log(`  Skipped note: author ${n.Responder} not found`);
      notesSkipped++;
      continue;
    }

    await Note.create({
      task: taskObjId,
      author: authorObjId,
      text: n.Text,
      createdAt: n.Date ? new Date(n.Date) : Date.now(),
    });
    notesCreated++;
  }

  // Summary
  console.log('\n=== Migration Complete ===');
  console.log(`Users created: ${Object.keys(userMap).length}`);
  console.log(`Tasks created: ${Object.keys(legacyToObjectId).length}`);
  console.log(`Invalid dependencies skipped: ${skippedDeps}`);
  console.log(`Notes created: ${notesCreated}`);
  console.log(`Notes skipped: ${notesSkipped}`);

  // Print legacy -> ObjectId mapping for reference
  console.log('\n--- Legacy ID Mapping ---');
  for (const [legacy, objId] of Object.entries(legacyToObjectId)) {
    console.log(`  ${legacy} -> ${objId}`);
  }

  await mongoose.connection.close();
  console.log('\nDatabase connection closed.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
