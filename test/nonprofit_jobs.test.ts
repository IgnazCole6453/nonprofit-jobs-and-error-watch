import test from 'node:test';
import assert from 'node:assert/strict';
import { processNonprofitJob } from '../src/nonprofit_jobs.js';

test('campaign report with zero donations is blocked so the worker can nack and surface it', () => {
  const result = processNonprofitJob({
    type: 'campaign_report',
    jobId: 'campaign-3001',
    campaignId: 'fall-drive',
    reportDate: '2026-09-15',
    donationsToday: 0,
    totalRaisedCents: 125000
  });

  assert.deepEqual(result, {
    status: 'blocked',
    reason: 'Skip empty report for campaign fall-drive'
  });
});

test('donor receipt becomes a concrete send action', () => {
  const result = processNonprofitJob({
    type: 'donor_receipt',
    jobId: 'receipt-1001',
    donationId: 'don-1001',
    donorEmail: 'donor@example.org',
    amountCents: 5000,
    donatedAt: '2026-09-15T08:00:00Z'
  });

  assert.equal(result.status, 'sent');
  assert.equal(result.summary, 'Receipt email queued for donor@example.org for $50.00');
});
