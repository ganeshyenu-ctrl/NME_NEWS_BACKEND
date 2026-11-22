import { connectDB, closeDB } from './config/db.js';
import { User } from './models/User.js';

const setupAdmin = async () => {
  try {
    await connectDB();

    const targetEmail = 'ganesh@nme.com';
    const targetPassword = 'GaneshGARY';
    const targetName = 'Ganesh';

    let user = await User.findOne({ email: targetEmail });

    if (user) {
      console.log(`[Admin Setup] Updating ${targetEmail}...`);
      user.name = targetName;
      user.password = targetPassword;
      user.role = 'admin';
      user.canPublish = true;
      user.status = 'active';
      await user.save();
      console.log(`[Admin Setup] Successfully updated ${targetEmail}!`);
    } else {
      console.log(`[Admin Setup] Creating new admin account ${targetEmail}...`);
      user = await User.create({
        name: targetName,
        email: targetEmail,
        password: targetPassword,
        role: 'admin',
        canPublish: true,
        status: 'active',
      });
      console.log(`[Admin Setup] Successfully created ${targetEmail}!`);
    }

    const allUsers = await User.find({}, 'name email role status canPublish');
    console.log('[Admin Setup] Accounts in DB:');
    console.table(
      allUsers.map((u) => ({
        Name: u.name,
        Email: u.email,
        Role: u.role,
        Status: u.status,
        CanPublish: u.canPublish,
      }))
    );

    await closeDB();
    process.exit(0);
  } catch (err) {
    console.error('[Admin Setup Error]:', err.message);
    process.exit(1);
  }
};

setupAdmin();
