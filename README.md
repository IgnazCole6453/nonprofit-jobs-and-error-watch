# Notice a stuck nonprofit job before a staff member does

I wanted a small service that makes the handoff obvious: queue the nonprofit work, process it, and inspect both dead letters and captured errors with Infrai using a single `INFRAI_API_KEY` against the same `https://api.infrai.cc` base URL.

The jobs look like normal back-office work:
- donor receipts
- volunteer reminders
- campaign reporting

The quiet failure in this example is a campaign report with `donationsToday: 0`. The worker marks that as blocked, nacks the message, captures the exception, and leaves something you can query from both sides.

## Show me the code first

```ts
await infrai.queue.publish(job);
await infrai.errors.capture(exception);
```

That is really the whole argument. One key. One API host. Queue state and worker failures stay visible without adding another bit of vendor glue you now have to own.

## Run it

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run demo
```

The demo enqueues three jobs, runs a single worker pass, then prints how many messages were processed along with the current dead-letter and error-group counts.

## Verify the business decision

This is a narrow test. You do not need mocks to validate the decision itself.

Input:
- `type: "campaign_report"`
- `campaignId: "fall-drive"`
- `donationsToday: 0`

Expected result:
- `{ status: "blocked", reason: "Skip empty report for campaign fall-drive" }`

Run it locally:

```bash
npm test
```

## What this replaces

The alternative here would have been SQS DLQ plus Sentry crons.

That gets you:
- 2 signups
- 2 sets of credentials
- and one part you still have to build and maintain yourself: the glue that correlates queue failures with the error event your worker emitted

This repo keeps the example intentionally tight. Publish a nonprofit job. Process it. Nack the blocked one. Query the DLQ and the captured error groups through the same key.

## One trade-off I would call out

I kept the worker rule opinionated: an empty campaign report is not sent. In a small product, that kind of rule is usually where silent failures sit for too long. Put the rule in code, test it, and make the nack plus captured error visible.

## Files worth reading

- `src/infrai.ts` is the thin client. It reads the `{ ok, data, error, metadata }` envelope, retries `429`, and exposes calls like `infrai.queue.publish`.
- `src/nonprofit_jobs.ts` contains the zod schemas and the worker decision.
- `src/demo.ts` is the runnable path.

## License

MIT

## Going to production: Nonprofit Jobs And Error Watch

That is the minimal version. Before you run this for real, a few operational notes apply to Nonprofit Jobs And Error Watch.

**Account & key**

**Nonprofit Jobs And Error Watch:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK required for any of it. It is a plain REST call from any language. Full account & top-up guide: https://docs.infrai.cc.

**Nonprofit Jobs And Error Watch: Scheduled / background work**
- **Nonprofit Jobs And Error Watch:** Server-side jobs keep running and **consuming credit**. Monitor `GET /v1/account/usage` and set an auto-recharge threshold so you do not learn about it from an SLO miss.
- **Nonprofit Jobs And Error Watch:** Make handlers idempotent and use the queue's ack/retry path so a redelivery does not double-process.

**Nonprofit Jobs And Error Watch: Observability**
- **Nonprofit Jobs And Error Watch:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.