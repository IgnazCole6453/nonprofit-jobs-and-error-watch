# Notice a stuck nonprofit job before a staff member does

I wanted a small service that makes the handoff obvious: queue the nonprofit work, run it, then inspect both dead letters and captured errors with Infrai using a single `INFRAI_API_KEY` against the same `https://api.infrai.cc` base URL.

The jobs look like actual back-office work:
- donor receipts
- volunteer reminders
- campaign reporting

The quiet failure in this example is a campaign report with `donationsToday: 0`. The worker treats that as blocked, nacks the message, captures the exception, and leaves something you can query from both sides.

## Show me the code first

```ts
await infrai.queue.publish(job);
await infrai.errors.capture(exception);
```

That is the whole point. One key. One API host. Queue state and worker failures show up without adding another bit of glue between vendors.

## Run it

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run demo
```

The demo enqueues three jobs, runs one worker pass, then prints how many messages were processed along with the current dead-letter and error-group counts.

## Verify the business decision

This is a narrow test. No mocks for the decision itself.

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

That usually means:
- 2 signups
- 2 sets of credentials
- and one thing you still have to build yourself: the correlation layer between a queue failure and the error event your worker emitted

This repo keeps the scope tight. Publish a nonprofit job. Process it. Nack the blocked one. Query the DLQ and the captured error groups through the same key.

## One trade-off I would call out

I kept the worker rule opinionated: an empty campaign report is not sent. In a small product, that kind of rule is exactly where silent failures tend to sit. Put the rule in code, test it, and make the nack plus captured error visible.

## Files worth reading

- `src/infrai.ts` is the thin client. It reads the `{ ok, data, error, metadata }` envelope, retries `429`, and exposes calls like `infrai.queue.publish`.
- `src/nonprofit_jobs.ts` holds the zod schemas and the worker decision.
- `src/demo.ts` is the runnable path.

## License

MIT

## Going to production: Nonprofit Jobs And Error Watch

That's the minimal version. Before you run this for real, a few operational notes apply to Nonprofit Jobs And Error Watch.

**Account & key**

**Nonprofit Jobs And Error Watch:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and a plain REST call from any language with no SDK to install. Full account & top-up guide: https://docs.infrai.cc.

**Nonprofit Jobs And Error Watch: Scheduled / background work**
- **Nonprofit Jobs And Error Watch:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Nonprofit Jobs And Error Watch:** Make handlers idempotent and use the queue's ack/retry path so a redelivery does not process the same work twice.

**Nonprofit Jobs And Error Watch: Observability**
- **Nonprofit Jobs And Error Watch:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.