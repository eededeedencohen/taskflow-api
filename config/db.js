const mongoose = require('mongoose');

const connectDB = async () => {
  const DB = process.env.DATABASE.replace(
    '<PASSWORD>', 
    process.env.DATABASE_PASSWORD
  );

  await mongoose.connect(DB);
  console.log('MongoDB connected successfully');
};

module.exports = connectDB;
