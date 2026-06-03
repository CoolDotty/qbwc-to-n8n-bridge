# QBWC to n8n Bridge Specification

## Overview

This specification defines a Node.js service that acts as a bridge between QuickBooks Web Connector (QBWC), QuickBooks Desktop, and n8n. QBWC is a Windows-side bridge that exchanges qbXML with QuickBooks Desktop by polling a web service endpoint, so the Node service must implement the QBWC SOAP contract and translate that polling loop into a queue-driven integration layer for downstream automation [cite:1]. n8n should remain behind this adapter rather than serving as the public QBWC endpoint, because QBWC expects a fixed SOAP method set while n8n's Webhook node is general-purpose HTTP automation infrastructure [cite:1][cite:70].

The bridge has four core responsibilities: authenticate QBWC clients, serve qbXML work to QuickBooks Desktop, persist QuickBooks responses, and emit internal events or API calls that n8n can consume [cite:1]. The intended deployment model is a public HTTPS Node endpoint for QBWC plus a private path from the bridge to n8n, either over an internal Docker network, loopback, or another trusted network segment [cite:1][cite:70].

## Goals

The project should provide a production-oriented integration adapter for QuickBooks Desktop environments where business workflows live in n8n but QuickBooks connectivity must happen through QBWC's SOAP polling model [cite:1]. It should support both inbound synchronization, such as querying invoices or customers from QuickBooks Desktop, and outbound write-back, such as creating or updating records after an n8n workflow decides a QuickBooks action is needed [cite:1].

The service should generate customer-specific `.qwc` files, manage per-connection credentials, expose the required SOAP methods, maintain a durable job queue, and normalize responses into events for downstream workflows [cite:1][cite:33][cite:103]. It should also be able to operate safely while n8n is internet-reachable by limiting direct exposure and funneling all QuickBooks traffic through the bridge boundary [cite:70].

## Non-goals

This project should not attempt to make n8n itself impersonate a QBWC SOAP server, because the Webhook node is not a drop-in replacement for the Web Connector contract and session lifecycle [cite:70][cite:80]. It should not attempt direct, real-time socket-style access to the QuickBooks company file from the VPS, because QuickBooks Desktop writes occur through QuickBooks on the Windows side when QBWC runs the returned qbXML locally [cite:1].

The project should also avoid treating QBWC as a true event bus. Intuit's Desktop event subscription model is not supported through Web Connector, so the bridge must model change detection as scheduled polling and delta processing rather than native push events from QuickBooks Desktop [cite:1].

## Context and data flow

The bridge operates in a poll/response loop. QBWC calls the public SOAP endpoint, authenticates, requests the next qbXML unit of work, sends that qbXML to QuickBooks Desktop locally, and then posts the result back to the same service so the bridge can persist the result and decide whether more work remains [cite:1].

The bridge then converts the response into internal business events. For example, a query response can be normalized into records stored in the bridge database and emitted as a webhook or API call to n8n, while an outbound n8n action can be turned into a queued qbXML add or modify request that QBWC picks up on the next poll [cite:70][cite:80].

### High-level sequence

1. Customer imports a generated `.qwc` file into Web Connector and enters a one-time password supplied by the bridge application [cite:2][cite:33].
2. QBWC calls the bridge over HTTPS using the configured `AppURL` in the `.qwc` file [cite:33][cite:103].
3. The bridge authenticates the connection and issues a short-lived session ticket tied to that connection [cite:1].
4. QBWC requests work through the SOAP flow; the bridge returns qbXML from its queue [cite:1].
5. QuickBooks Desktop executes the qbXML locally and returns the result through QBWC back to the bridge [cite:1].
6. The bridge stores the response, updates queue state, and notifies n8n through an internal webhook or API call [cite:70][cite:80].

## Functional requirements

### 1. QBWC SOAP service

The service must implement the QBWC SOAP method set required for a working Web Connector integration, including version negotiation, authentication, request issuance, response intake, error handling, and session closure [cite:1]. At a minimum, the implementation should support `serverVersion`, `clientVersion`, `authenticate`, `sendRequestXML`, `receiveResponseXML`, `getLastError`, and `closeConnection` [cite:1].

The service must be reachable over HTTPS at a stable public URL because QBWC connects to the `AppURL` specified in the `.qwc` file and remote examples use HTTPS for externally hosted services [cite:33][cite:103]. SOAP parsing and generation may use a Node package, but the project should keep the WSDL-specific logic isolated behind an adapter module so the business queue and n8n integration remain framework-independent [cite:1].

### 2. `.qwc` file generation

The bridge must generate a customer- or company-specific `.qwc` file that contains the service metadata and endpoint URL used by QBWC during setup [cite:2][cite:33]. The generated file should include fields commonly used in QuickBooks Web Connector configurations: `AppName`, `AppURL`, `AppSupport`, `UserName`, `OwnerID`, `FileID`, `QBType`, optional scheduler settings, and `IsReadOnly` [cite:33][cite:103].

`OwnerID` and `FileID` should be GUIDs generated by the application for identity and configuration uniqueness, while the actual security boundary should come from the username/password pair and session handling rather than those GUID values alone [cite:33]. The bridge UI or admin API should also support regenerating a `.qwc` file when connection metadata changes, such as domain migration or credential rotation [cite:2].

### 3. Authentication and authorization

Each connection must have a unique username and a high-entropy secret entered into QBWC during setup, because Web Connector integrations commonly rely on the `.qwc` file for the username and on the user-entered password for authentication [cite:2]. The bridge must store password material securely, preferably hashed with Argon2 or bcrypt, and authenticate only at the `authenticate` stage before issuing a short-lived session ticket for the rest of the SOAP cycle [cite:1].

The bridge should scope every session and queue item to a single tenant and a single QuickBooks connection. Requests without a valid session ticket, expired sessions, or requests referencing another tenant's job must be rejected even if they reach the public endpoint [cite:1].

### 4. Job queue

The bridge must maintain a durable queue of pending QuickBooks jobs. Each job represents a single qbXML unit of work such as a query, add, or modify request for an entity like customers or invoices [cite:1].

Queue items should support priorities, idempotency keys, retry counters, payload hashes, and status transitions such as `pending`, `leased`, `sent`, `succeeded`, `failed`, and `dead_letter`. `sendRequestXML` should lease at most one appropriate job per call for a given connection, and `receiveResponseXML` should correlate the response back to the leased job and update status accordingly [cite:1].

### 5. n8n integration surface

The bridge should integrate with n8n through a private webhook or an internal REST endpoint, not by exposing n8n directly as the QBWC endpoint [cite:70][cite:80]. The bridge should emit structured events when meaningful state changes occur, such as a sync response being received, a job failing, or a normalized entity set being stored [cite:70].

Recommended internal events include `qbwc.session.started`, `qbwc.auth.failed`, `qb.job.enqueued`, `qb.job.sent`, `qb.response.received`, `qb.entity.normalized`, `qb.job.failed`, and `qb.reconcile.requested`. n8n can then use Webhook-triggered workflows for immediate processing and Schedule-triggered workflows for retries, audits, and reconciliation sweeps [cite:70].

### 6. Delta synchronization

Because QBWC does not provide true event subscriptions for QuickBooks Desktop, the bridge must support polling-based delta sync patterns rather than native QuickBooks event hooks [cite:1]. Query jobs should therefore support incremental filters such as last modified timestamps, transaction IDs, or entity cursors stored per connection [cite:1].

The bridge must persist sync checkpoints so that subsequent polling cycles can ask QuickBooks only for records changed since the last successful sync. That allows the service to synthesize internal business events for n8n, such as "new invoice detected" or "customer updated," even though QuickBooks itself is only being queried on a schedule [cite:1].

## Suggested system architecture

### Components

| Component | Responsibility |
|---|---|
| Public Node service | Exposes QBWC SOAP endpoint over HTTPS and handles authentication, session state, queue leasing, and response persistence [cite:1] |
| Database | Stores tenants, connections, credentials, sessions, jobs, checkpoints, raw XML, and audit logs [cite:1] |
| Internal event publisher | Sends normalized events from the bridge into n8n over private webhook or internal API [cite:70] |
| n8n workflows | React to bridge events, perform business logic, and enqueue new outbound QuickBooks jobs [cite:70][cite:80] |
| Optional admin API/UI | Generates `.qwc` files, rotates secrets, inspects queue health, and triggers manual reconciliations [cite:2][cite:33] |

### Deployment

The first deployment target can be a public VPS with HTTPS termination in front of the Node service, while n8n remains accessible only through a private address or Docker network path from the bridge [cite:70]. The long-term deployment target can move both the bridge and n8n onto the same server or Docker Compose stack, with only the bridge published to the internet [cite:70].

A recommended reverse proxy setup is Caddy, Nginx, or Traefik in front of the bridge with TLS, request logging, body-size limits, and rate limiting. n8n should not publish public webhook routes for this integration path unless there is an explicit exception and separate hardening in place [cite:70].

## Suggested project structure

```text
qbwc-n8n-bridge/
  src/
    app.ts
    config/
      env.ts
    http/
      soap-controller.ts
      admin-controller.ts
      internal-events-controller.ts
    qbwc/
      wsdl/
      methods/
        authenticate.ts
        send-request-xml.ts
        receive-response-xml.ts
        get-last-error.ts
        close-connection.ts
      qwc-generator.ts
      qbxml/
        builders/
        parsers/
        entity-mappers/
    queue/
      enqueue-job.ts
      lease-job.ts
      complete-job.ts
      fail-job.ts
    integrations/
      n8n-client.ts
    db/
      schema.sql
      migrations/
      repositories/
    security/
      password.ts
      rate-limit.ts
      session-ticket.ts
      hmac.ts
    observability/
      logger.ts
      metrics.ts
      tracing.ts
  test/
  docs/
  docker-compose.yml
  Dockerfile
  README.md
```

This structure keeps the QuickBooks-specific protocol concerns separate from queueing, security, and n8n orchestration. It also makes it easier to replace n8n later with another automation backend without rewriting the QBWC adapter layer [cite:1][cite:70].

## Data model

### Core tables

| Table | Purpose |
|---|---|
| `tenants` | Logical customer/workspace isolation |
| `qb_connections` | One QuickBooks Web Connector installation or company-file connection per row |
| `qb_credentials` | Username, password hash, credential status, rotation metadata |
| `qb_sessions` | Short-lived session tickets issued during QBWC authentication |
| `qb_jobs` | Pending and completed qbXML work items |
| `qb_job_attempts` | Detailed execution attempts and retry history |
| `qb_sync_checkpoints` | Per-entity cursors for incremental polling |
| `qb_raw_messages` | Raw request and response XML for audit and debugging |
| `outbound_events` | Events destined for n8n with delivery status |
| `audit_logs` | Security and admin actions |

### `qb_connections` fields

Recommended fields include `id`, `tenant_id`, `display_name`, `username`, `owner_id`, `file_id`, `qb_type`, `is_read_only`, `poll_minutes`, `status`, `created_at`, and `updated_at`. The bridge should also track operational fields such as `last_success_at`, `last_error_at`, `last_company_file_hint`, and `last_seen_client_version` for supportability [cite:1][cite:33].

### `qb_jobs` fields

Recommended fields include `id`, `tenant_id`, `connection_id`, `job_type`, `entity_type`, `direction`, `idempotency_key`, `status`, `priority`, `qbxml_request`, `normalized_payload`, `leased_until`, `attempt_count`, `created_at`, and `updated_at`. The queue must support both inbound query jobs and outbound write jobs so n8n can request changes in QuickBooks Desktop asynchronously [cite:1].

## API and event contracts

### Internal enqueue API

The bridge should expose a private endpoint or service method that n8n can use to request outbound QuickBooks actions. Example payload:

```json
{
  "connectionId": "conn_123",
  "jobType": "invoice.add",
  "entityType": "invoice",
  "idempotencyKey": "order-9281-v1",
  "payload": {
    "customerRef": "80000001-123456789",
    "txnDate": "2026-06-03",
    "lines": [
      { "itemRef": "8000000A-123456789", "quantity": 1, "rate": 125.00 }
    ]
  }
}
```

The bridge should transform the normalized payload into qbXML only when leasing or dispatching the job, so version-specific XML logic stays centralized in the bridge rather than leaking into n8n workflows [cite:1].

### Internal n8n event payload

The bridge should POST normalized events into n8n with signed headers and tenant/job metadata. Example payload:

```json
{
  "type": "qb.response.received",
  "tenantId": "tenant_123",
  "connectionId": "conn_123",
  "jobId": "job_456",
  "entityType": "invoice",
  "result": {
    "status": "succeeded",
    "quickbooksIds": ["900001-1234"],
    "normalizedCount": 1
  },
  "timestamp": "2026-06-03T19:00:00.000Z"
}
```

The event should include an HMAC or equivalent shared-secret signature so n8n can verify that the event actually came from the bridge before processing it [cite:70][cite:80].

## Security requirements

The bridge must be the only internet-facing component for this integration path. Public access should terminate at a reverse proxy and the Node bridge, while n8n should receive only private or authenticated internal calls from the bridge [cite:70].

The bridge must enforce the following controls:

- HTTPS only for the public endpoint [cite:33].
- Per-connection credentials and no shared global password [cite:2].
- Password hashing at rest and short-lived session tickets in memory or database [cite:1].
- Rate limiting by IP and connection ID at the proxy or application layer [cite:70].
- Request body size limits and SOAP schema validation to reduce abuse [cite:1].
- Strict tenant scoping on every queue, session, and event record [cite:1].
- Signed internal callbacks to n8n using HMAC headers or equivalent [cite:70][cite:80].
- Audit logging for auth failures, rotations, setup actions, and dead-letter events [cite:1].

The bridge should also assume the public endpoint will be probed. That means it should return minimal error detail to unauthenticated callers, avoid leaking stack traces, and support IP-based blocking or abuse detection at the proxy layer [cite:70].

## Observability

The service should produce structured logs for each QBWC method call, connection ID, tenant ID, session ticket, queue lease, qbXML dispatch, and response parse result. It should also publish metrics for authentication failures, queue depth, time-to-lease, job latency, poll frequency, response parse errors, and n8n delivery failures [cite:1].

Recommended dashboards and alerts include:

- Queue depth by tenant and connection.
- Authentication failure spikes.
- No successful poll in more than expected interval plus grace period.
- High dead-letter rate.
- n8n delivery error rate above threshold.
- Mean job completion latency and response parsing failures.

## Error handling and retries

The bridge must distinguish between QBWC transport errors, QuickBooks business errors, qbXML parse failures, and downstream n8n delivery failures. Transport or temporary downstream failures should usually be retried with backoff, while malformed qbXML or unrecoverable QuickBooks business validation errors should move jobs to a failed or dead-letter state with operator visibility [cite:1].

`getLastError` should provide a safe, operator-meaningful error message to QBWC for the current session context, while detailed internals remain in bridge logs. n8n delivery failures should not lose the normalized QuickBooks response; the event should stay in an outbox table and be retried independently until delivered or manually handled [cite:1][cite:70].

## Initial entity support

The first release should keep entity scope narrow and stable. Recommended initial support:

| Entity | Query | Add | Modify |
|---|---|---|---|
| Customer | Yes [cite:1] | Yes [cite:1] | Yes [cite:1] |
| Invoice | Yes [cite:1] | Yes [cite:1] | Yes [cite:1] |
| Item | Yes [cite:1] | Optional | Optional |
| Payment | Yes [cite:1] | Optional | Optional |

This subset is enough to validate the architectural loop while keeping qbXML complexity manageable. Additional entities such as estimates, sales receipts, vendors, bills, and bill payments can be added after the core queueing and normalization pipeline is stable [cite:1].

## n8n workflow recommendations

The initial n8n setup should consist of three workflows:

1. **Bridge event intake**: Webhook-triggered, verifies signature, routes `qb.response.received` and `qb.entity.normalized` events into entity-specific logic [cite:70].
2. **Outbound QuickBooks enqueue**: Triggered by internal business events or app logic, transforms normalized business actions into bridge enqueue requests [cite:70].
3. **Reconciliation and retry**: Schedule-triggered, checks for stale jobs, failed deliveries, missing checkpoints, and manual remediation needs [cite:70].

This split keeps ingestion, business logic, and maintenance separate so the workflows remain understandable and easy to test [cite:70].

## Recommended implementation stack

The implementation should use modern TypeScript on Node.js with a small HTTP framework such as Express or Fastify, a SOAP library or manual XML handling wrapper for the QBWC contract, and Postgres for durable queue and audit storage. Docker support should be included from the start so the bridge can move cleanly from the current VPS arrangement to a shared server deployment with n8n later [cite:1][cite:70].

Recommended stack:

- Node.js LTS + TypeScript.
- Express or Fastify for HTTP.
- Postgres for state, queue, and outbox.
- Drizzle, Prisma, or Knex for migrations and access layer.
- XML parser/builder with explicit qbXML tests.
- Docker and Docker Compose for local and production packaging.
- Reverse proxy such as Caddy, Nginx, or Traefik for TLS and rate limiting.

## Delivery milestones

### Milestone 1: skeleton bridge

Deliver the public HTTPS service, SOAP method stubs, health endpoint, config loading, Postgres schema, and structured logging [cite:1]. This milestone proves the endpoint shape and deployment model.

### Milestone 2: authenticated connection and `.qwc` generation

Deliver credential issuance, password verification, session tickets, `.qwc` generation, and a basic setup path for one QuickBooks company file [cite:2][cite:33]. This milestone proves end-to-end connection setup with QBWC.

### Milestone 3: queue and query flow

Deliver queue leasing, one query type such as `CustomerQueryRq` or `InvoiceQueryRq`, response persistence, and normalized event emission into n8n [cite:1][cite:70]. This milestone proves the poll, request, response, and notify loop.

### Milestone 4: write-back flow

Deliver at least one outbound write operation such as customer add or invoice add, plus idempotency protection and operator-visible failure handling [cite:1]. This milestone proves two-way synchronization.

### Milestone 5: hardening

Deliver rate limiting, signed internal callbacks, dead-letter queue handling, observability dashboards, and reconciliation workflows in n8n [cite:70]. This milestone makes the bridge supportable in production.

## Acceptance criteria

The project should be considered successful when all of the following are true:

- A user can download a generated `.qwc` file, import it into QBWC, and complete setup against the public bridge URL [cite:2][cite:33].
- QBWC can authenticate successfully and receive at least one queued query job [cite:1].
- QuickBooks Desktop can execute that job and return a response that is persisted and normalized by the bridge [cite:1].
- The bridge can deliver a signed event to n8n, and an n8n workflow can act on it [cite:70][cite:80].
- n8n can request a new outbound QuickBooks action that the bridge queues and QuickBooks later executes through QBWC polling [cite:1].
- The public endpoint remains the only required internet-facing component for the integration path [cite:70].

## Open questions

Several implementation choices should be finalized before build-out begins:

- Which initial QuickBooks entities matter most for the first customer workflow?
- Which QuickBooks Desktop versions must be supported in the field?
- Should the bridge support one QuickBooks company file per connection or multiple company files per tenant?
- Should outbound n8n-to-bridge commands use internal webhooks, direct database writes, or a private REST API?
- Which operator UI is required in v1: CLI only, admin API only, or a small web dashboard?

Resolving these questions will narrow the qbXML surface area and reduce early complexity while preserving the architecture described above [cite:1][cite:70].
