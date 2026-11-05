import { z } from 'zod';
import { InfraiError, infrai, type QueueMessage } from './infrai.js';

export const donorReceiptJobSchema = z.object({
  type: z.literal('donor_receipt'),
  jobId: z.string().min(1),
  donationId: z.string().min(1),
  donorEmail: z.string().email(),
  amountCents: z.number().int().positive(),
  donatedAt: z.string().min(1)
});

export const volunteerReminderJobSchema = z.object({
  type: z.literal('volunteer_reminder'),
  jobId: z.string().min(1),
  volunteerId: z.string().min(1),
  volunteerEmail: z.string().email(),
  shiftStartsAt: z.string().min(1),
  role: z.string().min(1)
});

export const campaignReportJobSchema = z.object({
  type: z.literal('campaign_report'),
  jobId: z.string().min(1),
  campaignId: z.string().min(1),
  reportDate: z.string().min(1),
  donationsToday: z.number().int().nonnegative(),
  totalRaisedCents: z.number().int().nonnegative()
});

export const nonprofitJobSchema = z.discriminatedUnion('type', [
  donorReceiptJobSchema,
  volunteerReminderJobSchema,
  campaignReportJobSchema
]);

export type NonprofitJob = z.infer<typeof nonprofitJobSchema>;

export type ProcessedOutcome =
  | { status: 'sent'; summary: string }
  | { status: 'blocked'; reason: string };

export function buildReceiptSummary(job: z.infer<typeof donorReceiptJobSchema>): string {
  const dollars = (job.amountCents / 100).toFixed(2);
  return `Receipt email queued for ${job.donorEmail} for $${dollars}`;
}

export function processNonprofitJob(job: NonprofitJob): ProcessedOutcome {
  switch (job.type) {
    case 'donor_receipt':
      return { status: 'sent', summary: buildReceiptSummary(job) };
    case 'volunteer_reminder':
      return { status: 'sent', summary: `Reminder queued for ${job.volunteerEmail} (${job.role})` };
    case 'campaign_report':
      if (job.donationsToday === 0) {
        return { status: 'blocked', reason: `Skip empty report for campaign ${job.campaignId}` };
      }
      return { status: 'sent', summary: `Campaign ${job.campaignId} report queued with ${job.donationsToday} donations` };
  }
}

export async function enqueueNonprofitJob(queueName: string, input: unknown): Promise<NonprofitJob> {
  const job = nonprofitJobSchema.parse(input);
  await infrai.queue.publish(queueName, job);
  return job;
}

export async function ensureQueue(queueName: string): Promise<void> {
  try {
    await infrai.queue.create(queueName);
  } catch (error) {
    if (!(error instanceof InfraiError) || error.status !== 409) {
      throw error;
    }
  }
}

export async function runWorkerPass(queueName: string): Promise<Array<{ messageId: string; outcome: ProcessedOutcome }>> {
  const consumed = await infrai.queue.consume<NonprofitJob>(queueName, 10, 30);
  const items = consumed.data.items ?? [];
  const results: Array<{ messageId: string; outcome: ProcessedOutcome }> = [];

  for (const item of items) {
    await handleMessage(queueName, item, results);
  }

  return results;
}

async function handleMessage(
  queueName: string,
  item: QueueMessage<NonprofitJob>,
  results: Array<{ messageId: string; outcome: ProcessedOutcome }>
): Promise<void> {
  try {
    const job = nonprofitJobSchema.parse(item.payload);
    const outcome = processNonprofitJob(job);
    if (outcome.status === 'blocked') {
      throw new Error(outcome.reason);
    }
    await infrai.queue.ack(queueName, item.message_id);
    results.push({ messageId: item.message_id, outcome });
  } catch (error) {
    const exception = toExceptionPayload(error, queueName, item.payload);
    await infrai.errors.capture(exception);
    await infrai.queue.nack(queueName, item.message_id);
  }
}

function toExceptionPayload(error: unknown, queueName: string, payload: unknown): Record<string, unknown> {
  const err = error instanceof Error ? error : new Error('Unknown job failure');
  return {
    message: err.message,
    exception: { name: err.name, stack: err.stack },
    context: {
      queueName,
      payload
    }
  };
}

export async function getFailureSnapshot(queueName: string): Promise<{ deadLetters: unknown[]; errorGroups: unknown[] }> {
  const [dlq, groups] = await Promise.all([
    infrai.queue.dlq.list(queueName),
    infrai.errors.groups()
  ]);

  return {
    deadLetters: dlq.data.items ?? [],
    errorGroups: groups.data.items ?? []
  };
}
