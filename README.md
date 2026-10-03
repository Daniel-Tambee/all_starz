# Restoration Estimates API

A REST API for managing property restoration jobs. When a property is inspected, an estimator records customer information, property information, damage information, an estimated restoration cost, and a job status. This service stores that data, enforces a job status workflow, calculates restoration cost estimates, and produces a structured, AI-ready damage assessment payload that could be handed to an AI service for automated damage analysis and proposal generation.

## Technologies used

- Node.js 24 and TypeScript
- NestJS 12 (ESM)
- PostgreSQL 17 with Prisma ORM 6
- class-validator / class-transformer for request validation
- Swagger (OpenAPI 3.0) via @nestjs/swagger
- Jest and Supertest for unit and end-to-end tests
- Docker and Docker Compose

## Installation

Requires Node.js 24 or newer.

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and adjust the values:

```bash
cp .env.example .env
```

| Variable       | Description                                  | Example                                                                    |
| -------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma  | `postgresql://postgres:postgres@localhost:5432/restoration?schema=public` |
| `PORT`         | HTTP port the API listens on                 | `3000`                                                                      |

The database can be started with the bundled Docker Compose service, or pointed at any existing PostgreSQL instance.

## Database setup

Start PostgreSQL and apply the migration, then optionally load sample data:

```bash
docker compose up -d db
npm run migrate
npm run seed
```

- `npm run migrate` runs `prisma migrate deploy`, which applies the SQL migration in `prisma/migrations`.
- `npm run seed` inserts five sample jobs (JOB-001 through JOB-005) covering different damage types, statuses, and audit histories. Seeding is idempotent and safe to re-run.

To create a new migration during development, use `npm run migrate:dev`.

## Running the application

```bash
npm install
npm run migrate
npm run dev
```

- `npm run start:dev` starts the API in watch mode for local development.
- `npm run build` and `npm run start:prod` run a production build.
- The Swagger UI is served at `http://localhost:3000/docs` and the raw OpenAPI document at `http://localhost:3000/docs-json`.

### Running with Docker

The full stack (database plus API) can be started with a single command. The API container applies pending migrations before booting:

```bash
docker compose up --build
```

## API documentation

Interactive documentation is available at `/docs` (Swagger UI). The endpoints are:

| Method | Endpoint                  | Description                                        | Success | Errors            |
| ------ | ------------------------- | -------------------------------------------------- | ------- | ----------------- |
| POST   | `/jobs`                   | Create a restoration job                           | 201     | 400, 500          |
| GET    | `/jobs`                   | List jobs with optional filters and pagination     | 200     | 400, 500          |
| GET    | `/jobs/:id`               | Retrieve a single job                              | 200     | 404, 500          |
| PATCH  | `/jobs/:id/status`        | Update the status of a job                         | 200     | 400, 404, 409, 500 |
| POST   | `/jobs/:id/estimate`      | Calculate and persist the estimated cost           | 200     | 400, 404, 500     |
| POST   | `/jobs/:id/ai-assessment` | Build a structured payload for an AI service       | 200     | 404, 500          |

### Create a job

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "John Smith",
    "customerEmail": "john@example.com",
    "propertyAddress": "123 Main Street",
    "damageType": "WATER",
    "damageDescription": "Water damage affecting the kitchen ceiling and wall.",
    "squareFeet": 450
  }'
```

The server validates the email address, the damage type (WATER, FIRE, MOLD, STORM, OTHER), and the square footage (positive integer). It generates a sequential unique id (`JOB-001`, `JOB-002`, ...), sets the initial status to `NEW`, sets `estimatedCost` to `0`, records the initial status in the audit trail, and returns the created job.

### List jobs

```bash
curl "http://localhost:3000/jobs?status=ESTIMATING&damageType=WATER&page=1&limit=20"
```

`status` and `damageType` are optional filters. Pagination defaults to page 1 and limit 20 (maximum 100). The response is an envelope:

```json
{
  "data": [ ... ],
  "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
}
```

### Retrieve a single job

```bash
curl http://localhost:3000/jobs/JOB-001
```

Returns `404` with a consistent error body when the job does not exist.

### Update job status

```bash
curl -X PATCH http://localhost:3000/jobs/JOB-001/status \
  -H "Content-Type: application/json" \
  -d '{ "status": "INSPECTION" }'
```

Unknown status values are rejected with `400`. Transitions that are not allowed are rejected with `409`, as is a request to set the status to the value it already has.

#### Status transition rules

| From            | Allowed transitions                        |
| --------------- | ------------------------------------------ |
| NEW             | INSPECTION, ESTIMATING, CANCELLED          |
| INSPECTION      | ESTIMATING, CANCELLED                      |
| ESTIMATING      | PROPOSAL_SENT, CANCELLED                   |
| PROPOSAL_SENT   | APPROVED, CANCELLED                        |
| APPROVED        | IN_PROGRESS, CANCELLED                     |
| IN_PROGRESS     | COMPLETED, CANCELLED                       |
| COMPLETED       | none (terminal)                            |
| CANCELLED       | none (terminal)                            |

The rules guarantee the two hard requirements of the exercise: `COMPLETED → ESTIMATING` and `CANCELLED → IN_PROGRESS` are impossible, because COMPLETED and CANCELLED are terminal states. The forward chain mirrors a realistic restoration workflow (inspection, estimate, proposal, approval, execution) and every non-terminal state can be cancelled. Every accepted transition is written to the audit trail.

### Estimate restoration cost

```bash
curl -X POST http://localhost:3000/jobs/JOB-001/estimate \
  -H "Content-Type: application/json" \
  -d '{ "laborCost": 1500, "materialCost": 2000, "equipmentCost": 500 }'
```

The API sums the three costs, rounds to two decimal places, persists the result as `estimatedCost`, and returns the updated job (the example above yields `"estimatedCost": 4000`). Missing costs, non-numeric values, and negative costs are rejected with `400`.

### AI-ready damage assessment

```bash
curl -X POST http://localhost:3000/jobs/JOB-001/ai-assessment
```

The endpoint does not call an AI provider. It assembles the job's business data into the structured payload an AI service would receive:

```json
{
  "jobId": "JOB-001",
  "property": { "address": "123 Main Street", "squareFeet": 450 },
  "damage": { "type": "WATER", "description": "Water damage affecting the kitchen ceiling and wall." },
  "currentEstimate": 4000,
  "instructions": "Analyze the reported property damage and suggest appropriate restoration actions."
}
```

### Error format

All errors share one shape, produced by a global exception filter:

```json
{ "success": false, "message": "Job not found" }
```

Validation failures join every violated rule into a single message, for example `"customerEmail must be an email"`. The API maps errors to `400` (invalid request), `404` (not found), `409` (disallowed status transition), and `500` (unexpected server error, logged server-side with a generic message returned to the client).

## Testing

```bash
npm test
npm run test:e2e
```

- `npm test` runs unit tests for the job service: sequential id generation and retry on id collision, status transition enforcement, estimate calculation and rounding, filters and pagination metadata, and the AI payload.
- `npm run test:e2e` runs end-to-end tests over the full HTTP stack (routing, validation pipe, exception filter): job creation with all its validation rules, retrieval, filtering, pagination, status updates including the forbidden transitions, estimates, and the AI assessment endpoint.

The e2e suite runs against an in-memory Prisma test double, so no database or Docker is needed to run the tests.

## Design decisions

- **NestJS layered architecture.** Controllers stay thin, the service holds business rules (id generation, the status machine, cost calculation), and DTOs with class-validator decorators own request validation. The global `ValidationPipe` and a global exception filter are registered on the app module so every endpoint behaves consistently.
- **Prisma with PostgreSQL.** A relational schema fits the data naturally (jobs plus an audit table). Enums for damage type and status are enforced by the database, indexes support the list filters, and the `jobNumber` column backs the human-readable sequential job id.
- **Sequential job ids.** The id is derived from `max(jobNumber) + 1` inside the create transaction and zero-padded (`JOB-001`). A unique constraint plus a bounded retry protects against two concurrent creates picking the same number.
- **Status machine in one place.** The allowed transitions are a single lookup table in the service. Disallowed transitions return `409 Conflict` (the state is not what the caller assumed), while syntactically invalid statuses return `400`. Transitions and their audit rows are written in one transaction.
- **Audit trail.** `JobStatusChange` records every status, including the initial `NEW` on creation, with a nullable `fromStatus` for the first entry. This is the foundation the bonus AI/automation features would build on.
- **Money as a rounded float.** Costs are stored as double precision and rounded to two decimals at the calculation boundary, which keeps JSON responses numeric as shown in the exercise examples while avoiding floating-point artifacts in the total.
- **AI payload as a contract.** The assessment endpoint returns a plain data structure with an explicit `instructions` field, so the eventual AI integration can be swapped in behind the same contract without touching clients.
- **ESM.** NestJS 12 ships ESM-only packages, so the project is configured as a native ES module (`"type": "module"`, NodeNext module resolution, `.js` extensions on relative imports), with Jest running in ESM mode and the seed script executed by Node's built-in TypeScript type stripping.
