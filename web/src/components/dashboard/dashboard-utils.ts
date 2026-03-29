"use client";

import type { Incident, Vehicle } from "@/types/frontend";

function ensureNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function ensureString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function normalizeIncident(value: unknown): Incident | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const id = ensureString(record.id);
  const citizenName = ensureString(record.citizen_name);
  const incidentType = ensureString(record.incident_type);
  const status = ensureString(record.status, "created");

  if (!id || !citizenName || !incidentType) return null;

  return {
    id,
    citizen_name: citizenName,
    citizen_phone: ensureString(record.citizen_phone) || undefined,
    incident_type: incidentType,
    latitude: ensureNumber(record.latitude),
    longitude: ensureNumber(record.longitude),
    notes: ensureString(record.notes) || undefined,
    assigned_unit_id: ensureString(record.assigned_unit_id) || undefined,
    assigned_unit_type: ensureString(record.assigned_unit_type) || undefined,
    status,
    dispatched_at: ensureString(record.dispatched_at) || undefined,
    resolved_at: ensureString(record.resolved_at) || undefined,
    created_at: ensureString(record.created_at) || undefined,
    updated_at: ensureString(record.updated_at) || undefined,
  };
}

export function mergeIncidentRecord(current: Incident[], incoming: Incident) {
  const next = current.filter((incident) => incident.id !== incoming.id);
  return [incoming, ...next];
}

export function formatIncidentCoords(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "N/A";
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

export function getVehicleLabel(vehicle: Vehicle) {
  return vehicle.license_plate || "Unassigned Unit";
}

