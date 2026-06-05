# ⚠️ DEPRECATED

**This project is deprecated in favor of an n8n custom trigger node.** Please use the official n8n integration instead.

See: https://github.com/CoolDotty/n8n-QuickBooks-Web-Connect

---

# QBWC to n8n Bridge

A production-oriented Node.js bridge between QuickBooks Web Connector (QBWC) and n8n. This service implements the QBWC SOAP contract, manages a durable job queue, and emits normalized events to n8n via private webhooks.

## Architecture

- **Public SOAP endpoint** (`/qbwc`) for QBWC polling
- **Private admin API** (`/api/admin`) for connection and job management
- **Internal events API** (`/api/internal`) for event delivery and webhook ingestion
- **Postgres** for durable state, queue, and audit logs

## Quick Start

1. Copy `.env.example` to `.env` and fill in your values.
2. Start services:
   ```bash
   docker-compose up -d
   ```
3. Run migrations (done automatically in Docker, or manually):
   ```bash
   npm run db:migrate
   ```
4. Create a connection:
   ```bash
   curl -X POST http://localhost:3000/api/admin/connections \
     -H "Content-Type: application/json" \
     -d '{"tenantId":"00000000-0000-0000-0000-000000000001","displayName":"MyCompany","username":"admin","password":"secret123","qbType":"US","pollMinutes":30}'
   ```
5. Download the `.qwc` file and import it into QuickBooks Web Connector:
   ```bash
   curl http://localhost:3000/api/admin/connections/{id}/qwc --output mycompany.qwc
   ```
6. Enqueue a query job:
   ```bash
   curl -X POST http://localhost:3000/api/admin/connections/{id}/jobs \
     -H "Content-Type: application/json" \
     -d '{"jobType":"customer.query","entityType":"customer"}'
   ```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PUBLIC_URL` | Yes | Public HTTPS URL for QBWC |
| `DATABASE_URL` | Yes | Postgres connection string |
| `SESSION_SECRET` | Yes | Secret for session ticket generation |
| `N8N_WEBHOOK_URL` | No | Internal n8n webhook URL |
| `N8N_WEBHOOK_SECRET` | No | Shared secret for HMAC signing |
| `PORT` | No | Server port (default 3000) |
| `LOG_LEVEL` | No | Log level (default info) |

## QBWC SOAP Methods

The service implements the full QBWC method set:
- `serverVersion`
- `clientVersion`
- `authenticate`
- `sendRequestXML`
- `receiveResponseXML`
- `getLastError`
- `closeConnection`

## Security

- Per-connection username/password with bcrypt hashing
- Short-lived session tickets
- Rate limiting on the SOAP endpoint
- HMAC-signed internal callbacks to n8n
- Strict tenant scoping

## Project Structure

See `qbwc-n8n-bridge-spec.md` for the full specification and suggested architecture.

## License

MIT
