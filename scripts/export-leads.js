const mongoose = require('mongoose');
const config = require('../src/config');
const { connectDB } = require('../src/db');
const { runWeeklyLeadsExportJob } = require('../src/jobs/scheduler');

async function main() {
  console.log('--- Fospertise Customer Database Export CLI ---');
  console.log(`Connecting to MongoDB...`);
  await connectDB();

  console.log(`Executing export and email dispatch to: ${config.ADMIN_REPORT_EMAIL || config.SMTP_USER}`);
  const result = await runWeeklyLeadsExportJob();

  if (result.success) {
    console.log(`\n✅ Success! Customer database Excel export sent successfully.`);
    console.log(`Message ID: ${result.messageId}`);
    console.log(`Delivered to: ${result.recipient}`);
  } else {
    console.error(`\n❌ Failed to deliver export: ${result.error}`);
    process.exitCode = 1;
  }

  await mongoose.disconnect();
  console.log('MongoDB disconnected. Done.');
}

main().catch(async (err) => {
  console.error('Fatal error during export execution:', err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
