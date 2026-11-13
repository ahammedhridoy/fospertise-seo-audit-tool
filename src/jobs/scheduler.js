const cron = require('node-cron');
const { exportLeadsToExcelBuffer } = require('../services/leadExporter');
const { sendWeeklyLeadsExportEmail } = require('../services/email');

/**
 * Execute the weekly leads export and email dispatch.
 * Exported separately so it can be called manually or by tests.
 *
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function runWeeklyLeadsExportJob() {
  console.log('[Scheduler] Starting scheduled weekly customer database export...');
  try {
    const { buffer, filename, totalCount, newThisWeek, avgScore } = await exportLeadsToExcelBuffer();
    console.log(`[Scheduler] Generated Excel file: ${filename} with ${totalCount} records (${newThisWeek} this week).`);

    const result = await sendWeeklyLeadsExportEmail({
      buffer,
      filename,
      totalCount,
      newThisWeek,
      avgScore
    });

    if (result.success) {
      console.log(`[Scheduler] Weekly leads export successfully delivered to ${result.recipient}.`);
    } else {
      console.error(`[Scheduler] Weekly leads export failed to send: ${result.error}`);
    }

    return result;
  } catch (err) {
    console.error('[Scheduler] Unexpected error during weekly leads export:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Initialize all scheduled background tasks for the application.
 * Runs every Friday at 23:59 (Asia/Dhaka timezone: UTC+6).
 */
function initScheduler() {
  // Cron expression: 59 (minute) 23 (hour) * (day of month) * (month) 5 (Friday)
  const cronExpression = '59 23 * * 5';
  const timezone = 'Asia/Dhaka';

  const task = cron.schedule(
    cronExpression,
    async () => {
      console.log(`[Scheduler] Cron trigger fired at ${new Date().toISOString()} (${timezone})`);
      await runWeeklyLeadsExportJob();
    },
    {
      timezone,
      scheduled: true
    }
  );

  console.log(`[Scheduler] Weekly customer export initialized: '${cronExpression}' (${timezone})`);
  return task;
}

module.exports = {
  initScheduler,
  runWeeklyLeadsExportJob
};
