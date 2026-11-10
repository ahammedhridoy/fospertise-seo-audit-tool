const { connectDB, closeDB } = require('../src/db');
const Lead = require('../src/models/Lead');

async function run() {
  console.log('--- Database Test ---');
  console.log('Connecting to MongoDB...');
  await connectDB();

  try {
    console.log('Creating sample Lead...');
    const sampleLead = await Lead.create({
      companyName: 'Acme Test Corp',
      website: 'https://acme-test.example.com',
      productsServices: 'Custom web application engineering and cloud solutions',
      industry: 'Software Development',
      location: 'San Francisco, CA',
      email: 'hello@acme-test.example.com',
      consent: true
    });
    console.log('Sample Lead created with ID:', sampleLead._id.toString());

    console.log('Reading sample Lead back from database...');
    const retrievedLead = await Lead.findById(sampleLead._id);
    if (!retrievedLead) {
      throw new Error('Failed to retrieve created lead');
    }
    console.log('Retrieved Lead successfully:');
    console.log({
      id: retrievedLead._id.toString(),
      companyName: retrievedLead.companyName,
      website: retrievedLead.website,
      email: retrievedLead.email,
      consent: retrievedLead.consent,
      createdAt: retrievedLead.createdAt
    });

    console.log('Deleting sample Lead...');
    const deleted = await Lead.findByIdAndDelete(sampleLead._id);
    if (!deleted) {
      throw new Error('Failed to delete sample lead');
    }
    console.log('Sample Lead deleted successfully.');

    // Verify deletion
    const checkDeleted = await Lead.findById(sampleLead._id);
    if (checkDeleted) {
      throw new Error('Lead still exists after deletion');
    }
    console.log('Verified sample Lead no longer exists in database.');
    console.log('--- Database Test PASSED ---');
  } finally {
    console.log('Closing MongoDB connection...');
    await closeDB();
    console.log('Connection closed.');
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Database test failed:', err.message);
    process.exit(1);
  });
}

module.exports = run;
