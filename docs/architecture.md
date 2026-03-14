# Emergency Dispatch System Architecture

## Services

### Auth Service (`:8081`)
- Handles registration, login, refresh tokens, profile lookup, and user listing.
- Uses PostgreSQL database `auth_db`.
- Issues JWT access tokens and stores refresh tokens.

### Incident Service (`:8082`)
- Creates and tracks incident lifecycle records.
- Stores responder stations and uses PostGIS distance queries to choose the nearest available station.
- Calls the dispatch service when auto-dispatching a vehicle.
- Uses PostgreSQL database `incident_db` with PostGIS enabled.

### Dispatch Tracking Service (`:8083`)
- Registers vehicles, updates vehicle status, and stores location history.
- Publishes vehicle movement and status events.
- Uses PostgreSQL database `dispatch_db` with PostGIS enabled.

### Analytics Service (`:8084`)
- Consumes RabbitMQ incident events and stores derived reporting metrics.
- Exposes dashboard-style query endpoints for response times, incidents by region, utilization, and hospital capacity.
- Uses PostgreSQL database `analytics_db`.

### Realtime Gateway (`:8085`)
- Accepts authenticated websocket clients.
- Consumes broker events and broadcasts updates to dashboard clients.

### Web Frontend (`:3000`)
- Next.js application for operations dashboard views.
- Currently includes a dashboard shell with sample data that can be replaced by live API calls.

## Event Flow

1. A user logs in through the auth service and receives a JWT.
2. An authenticated client creates an incident in the incident service.
3. The incident service finds the nearest valid station and requests a vehicle from the dispatch service.
4. Incident and vehicle lifecycle changes are published to RabbitMQ.
5. The analytics service consumes those events and updates reporting tables.
6. The realtime gateway consumes broker events and pushes them to connected dashboards.
7. The frontend reads REST endpoints for snapshots and websocket messages for live updates.

## Datastores

- `auth_db`: users and refresh tokens
- `incident_db`: incidents and responder stations
- `dispatch_db`: vehicles and location history
- `analytics_db`: derived metrics and hospital capacity snapshots

## Infrastructure Assumptions

- PostgreSQL runs locally on port `5432`.
- RabbitMQ is provided through CloudAMQP using the `RABBITMQ_URL` environment variable.
- PostGIS must be enabled in `incident_db` and `dispatch_db` before running the services.
- All services read from the root `.env` file.
