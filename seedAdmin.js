const path = require('path');
const dotenv = require('dotenv');

// Load env vars from root .env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const User = require('./models/User');

const ADMIN_USER = {
  name: 'PitchPe Admin',
  email: 'admin@pitchpe.in',
  password: 'Admin@123',
  role: 'admin',
};

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');

    // Check if admin already exists
    const existing = await User.findOne({ email: ADMIN_USER.email });
    if (existing) {
      console.log(`\nAdmin user already exists:`);
      console.log(`  Email:    ${existing.email}`);
      console.log(`  Role:     ${existing.role}`);
      console.log(`  Name:     ${existing.name}`);

      if (existing.role !== 'admin') {
        existing.role = 'admin';
        await existing.save();
        console.log(`\n  → Role upgraded to admin!`);
      }
    } else {
      const user = await User.create(ADMIN_USER);
      console.log(`\n✅ Admin user created successfully!`);
      console.log(`  Email:    ${user.email}`);
      console.log(`  Password: ${ADMIN_USER.password}`);
      console.log(`  Role:     ${user.role}`);
    }

    console.log('\n-----------------------------------');
    console.log('Admin Credentials:');
    console.log(`  Email:    ${ADMIN_USER.email}`);
    console.log(`  Password: ${ADMIN_USER.password}`);
    console.log('-----------------------------------\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedAdmin();
