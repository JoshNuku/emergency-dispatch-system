-- Emergency Dispatch System - Database Setup
-- Run this script as a PostgreSQL superuser (e.g., postgres)
-- Usage: psql -U postgres -f scripts/setup-db.sql

-- Create databases
CREATE DATABASE auth_db;
CREATE DATABASE incident_db;
CREATE DATABASE dispatch_db;
CREATE DATABASE analytics_db;

-- Enable PostGIS on incident_db
\c incident_db
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enable PostGIS on dispatch_db
\c dispatch_db
CREATE EXTENSION IF NOT EXISTS postgis;

-- Verify PostGIS installation
\c incident_db
SELECT PostGIS_Version();

\c dispatch_db
SELECT PostGIS_Version();
