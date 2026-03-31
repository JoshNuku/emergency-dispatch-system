# Production Deployment Guide

This guide deploys backend services on Render using the `render.yaml` Blueprint, and the frontend on Vercel.

## 1. Prerequisites

- A Render account (for backend services)
- A Vercel account (for frontend)
- A RabbitMQ URL (CloudAMQP free plan recommended)
- A PostgreSQL URL/credentials from a free provider (Neon/Supabase)
- A Mapbox public token

## 2. Deploy Backend Services with Render Blueprint

1. Push this repository to GitHub/GitLab.
2. In Render, choose New + Blueprint and select your repository.
3. Render will read `render.yaml` and create:
	- 5 free web services (`eds-auth`, `eds-incident`, `eds-dispatch`, `eds-analytics`, `eds-realtime-gateway`)

## 2.1 About Databases on Free Tier

- This blueprint is intentionally configured with **no Render managed databases** to keep cost at zero.
- Use one external free PostgreSQL instance and point all four services to it.
- Set different DB names if your provider allows multiple databases.
- If your free provider allows only one DB, use the same DB name for all services.

## 3. Required Environment Variables

Set these in Render (marked `sync: false` in `render.yaml`):

- `JWT_SECRET` on all backend services
- `RABBITMQ_URL` on incident/dispatch/analytics/realtime-gateway
- `AUTH_DB_HOST`, `AUTH_DB_PORT`, `AUTH_DB_USER`, `AUTH_DB_PASSWORD`, `AUTH_DB_NAME`, `AUTH_DB_SSLMODE`
- `INCIDENT_DB_HOST`, `INCIDENT_DB_PORT`, `INCIDENT_DB_USER`, `INCIDENT_DB_PASSWORD`, `INCIDENT_DB_NAME`, `INCIDENT_DB_SSLMODE`
- `DISPATCH_DB_HOST`, `DISPATCH_DB_PORT`, `DISPATCH_DB_USER`, `DISPATCH_DB_PASSWORD`, `DISPATCH_DB_NAME`, `DISPATCH_DB_SSLMODE`
- `ANALYTICS_DB_HOST`, `ANALYTICS_DB_PORT`, `ANALYTICS_DB_USER`, `ANALYTICS_DB_PASSWORD`, `ANALYTICS_DB_NAME`, `ANALYTICS_DB_SSLMODE`
- `CORS_ALLOW_ORIGINS` on analytics and realtime-gateway
	- Set to your Vercel frontend URL, e.g. `https://emergency-dispatch-system.vercel.app`

## 4. PostGIS Initialization

`incident` and `dispatch` services run:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

on startup, so no manual PostGIS SQL step is required when the DB user has permission.

For hosted free Postgres providers where extension creation is restricted, enable PostGIS manually (if supported) or use a PostGIS-capable provider/plan.

## 4.1 Recommended SSL Setting

Set `*_DB_SSLMODE=require` on Render for all backend services.

## 5. Deploy Frontend on Vercel

1. In Vercel, import the repository and select the `web/` directory as the root.
2. Set environment variables:
	- `NEXT_PUBLIC_MAPBOX_TOKEN`: Your Mapbox public token
	- `NEXT_PUBLIC_WS_URL`: Your Render realtime gateway WebSocket URL, e.g. `wss://eds-realtime-gateway.onrender.com/ws`
3. Deploy.

## 6. Verify Deployment

Check these endpoints:

- `https://eds-auth.onrender.com/health`
- `https://eds-incident.onrender.com/health`
- `https://eds-dispatch.onrender.com/health`
- `https://eds-analytics.onrender.com/health`
- `https://eds-realtime-gateway.onrender.com/health`
- Frontend: `https://emergency-dispatch-system.vercel.app`

## 7. Important Notes

- Frontend is deployed on Vercel (standard Next.js).
- Backends are native Go services deployed on Render (no Docker).
- If you change service names in Render, update `render.yaml` and Vercel environment variables accordingly.
- Vercel and Render services communicate via public HTTPS/WebSocket endpoints.
