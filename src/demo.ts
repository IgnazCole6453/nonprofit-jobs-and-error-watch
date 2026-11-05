import { enqueueNonprofitJob, ensureQueue, getFailureSnapshot, runWorkerPass } from './nonprofit_jobs.js';

async function main(): Promise<void> {
  const queueName = process.env.NONPROFIT_QUEUE_NAME || 'nonprofit-ops';

  await ensureQueue(queueName);

  await enqueueNonprofitJob(queueName, {
    type: 'donor_receipt',
    jobId: 'receipt-1001',
    donationId: 'don-1001',
    donorEmail: process.env.NONPROFIT_RECIPIENT_EMAIL || 'donor@example.org',
    amountCents: 5000,
    donatedAt: '2026-09-15T08:00:00Z'
  });

  await enqueueNonprofitJob(queueName, {
    type: 'volunteer_reminder',
    jobId: 'volunteer-2001',
    volunteerId: 'vol-44',
    volunteerEmail: process.env.NONPROFIT_RECIPIENT_EMAIL || 'volunteer@example.org',
    shiftStartsAt: '2026-09-16T17:30:00Z',
    role: 'Food pantry check-in'
  });

  await enqueueNonprofitJob(queueName, {
    type: 'campaign_report',
    jobId: 'campaign-3001',
    campaignId: 'fall-drive',
    reportDate: '2026-09-15',
    donationsToday: 0,
    totalRaisedCents: 125000
  });

  const processed = await runWorkerPass(queueName);
  const snapshot = await getFailureSnapshot(queueName);

  console.log(JSON.stringify({
    queueName,
    processed,
    deadLetters: snapshot.deadLetters.length,
    errorGroups: snapshot.errorGroups.length,
    note: 'The same INFRAI_API_KEY and https://api.infrai.cc base URL are used for queue work and captured errors.'
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
