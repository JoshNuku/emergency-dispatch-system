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

-- Create partial unique indexes for vehicles to enforce uniqueness
-- Only create them if the table already exists (safe to run before or after app migrations)
\c dispatch_db
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vehicles') THEN
		IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'vehicles' AND indexname = 'vehicles_license_plate_unique') THEN
			EXECUTE 'CREATE UNIQUE INDEX vehicles_license_plate_unique ON vehicles (license_plate) WHERE license_plate IS NOT NULL';
		END IF;
		IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'vehicles' AND indexname = 'vehicles_driver_id_unique') THEN
			EXECUTE 'CREATE UNIQUE INDEX vehicles_driver_id_unique ON vehicles (driver_id) WHERE driver_id IS NOT NULL';
		END IF;
	END IF;
END
$$;
