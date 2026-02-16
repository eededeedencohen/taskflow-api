const express = require('express');
const noteController = require('../controllers/noteController');
const { protect } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

router.use(protect);

router
  .route('/')
  .get(noteController.getNotes)
  .post(noteController.createNote);

module.exports = router;
