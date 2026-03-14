# Local Setup

## 1. Prerequisites

- Go 1.26+
- Node.js 24+
- PostgreSQL 18
- PostGIS extension for PostgreSQL
- A CloudAMQP instance

## 2. Environment File

Copy `.env.example` to `.env` in the project root and update:

- PostgreSQL password values
- `JWT_SECRET`
- `RABBITMQ_URL`
- `NEXT_PUBLIC_MAPBOX_TOKEN`

By default, local startup now seeds demo users, stations, and vehicles unless `SEED_DEMO_DATA=false`.

Demo login:

- Email: `system_admin@dispatch.local`
- Password: `dispatch1234`

## 3. Create Databases

Run the bootstrap SQL as a PostgreSQL superuser:

```sql
psql -U postgres -f scripts/setup-db.sql
```

This creates:

- `auth_db`
- `incident_db`
- `dispatch_db`
- `analytics_db`

It also enables PostGIS in the incident and dispatch databases.

## 4. Run the Go Services

Open separate terminals in each service folder and start them with `go run ./cmd`.

### Auth

```bash
cd services/auth
go run ./cmd
```

### Incident

```bash
cd services/incident
go run ./cmd
```

### Dispatch

```bash
cd services/dispatch
go run ./cmd
```

### Analytics

```bash
cd services/analytics
go run ./cmd
```

### Realtime Gateway

```bash
cd services/realtime-gateway
go run ./cmd
```

## 5. Run the Frontend

```bash
cd web
npm run dev
```

Open `http://localhost:3000`.

## Optional: Run Everything Together

From the workspace root in a bash shell:

```bash
bash scripts/run-dev.sh
```

This starts all Go services plus the Next.js frontend and stops them together when you press `Ctrl+C`.

## 6. Default Local Ports

- Auth: `8081`
- Incident: `8082`
- Dispatch: `8083`
- Analytics: `8084`
- Gateway: `8085`
- Frontend: `3000`

## 7. Recommended Next Steps

1. Create incidents through the dashboard or API to verify auto-dispatch against the seeded stations and vehicles.
2. Extend websocket handling to refresh analytics cards when incident lifecycle events arrive.
3. Add role-specific screens and forms for station management, incident creation, and vehicle updates.
4. Replace the current demo markers with richer map layers, route lines, and hospital capacity overlays.
