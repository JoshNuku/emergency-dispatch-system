import type {
  DashboardStats,
  Incident,
  Station,
  Vehicle,
} from "@/types/frontend";

export function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function ensureNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function ensureString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function normalizeIncident(raw: unknown): Incident | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = ensureString(record.id);
  const citizenName = ensureString(record.citizen_name);
  const incidentType = ensureString(record.incident_type, "unknown");
  const status = ensureString(record.status, "created");
  if (!id || !citizenName) return null;
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

export function normalizeVehicle(raw: unknown): Vehicle | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = ensureString(record.id);
  if (!id) return null;

  const latitude = ensureNumber(
    record.latitude ?? record.lat ?? record.current_latitude ?? record.currentLatitude,
    0,
  );
  const longitude = ensureNumber(
    record.longitude ?? record.lng ?? record.current_longitude ?? record.currentLongitude,
    0,
  );

  return {
    id,
    station_id: ensureString(record.station_id),
    station_type: ensureString(record.station_type, "unknown"),
    vehicle_type: ensureString(record.vehicle_type, "unknown"),
    license_plate: ensureString(record.license_plate) || undefined,
    driver_id: ensureString(record.driver_id) || undefined,
    driver_name: ensureString(record.driver_name) || undefined,
    status: ensureString(record.status, "available"),
    latitude,
    longitude,
    incident_id: ensureString(record.incident_id) || undefined,
    created_at: ensureString(record.created_at) || undefined,
    updated_at: ensureString(record.updated_at) || undefined,
  };
}

export function normalizeDashboardStats(raw: unknown): DashboardStats | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  return {
    total_incidents: ensureNumber(record.total_incidents),
    avg_response_time_seconds: ensureNumber(record.avg_response_time_seconds),
    incidents_by_type: ensureArray<{ incident_type: string; count: number }>(record.incidents_by_type).map((item) => ({
      incident_type: ensureString(item.incident_type),
      count: ensureNumber(item.count),
    })),
  };
}

export function normalizeStation(raw: unknown): Station | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = ensureString(record.id);
  const name = ensureString(record.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    type: ensureString(record.type, "unknown"),
    latitude: ensureNumber(record.latitude),
    longitude: ensureNumber(record.longitude),
    is_available: record.is_available === true,
    total_capacity: ensureNumber(record.total_capacity) || undefined,
    available_capacity: ensureNumber(record.available_capacity) || undefined,
    contact_phone: ensureString(record.contact_phone) || undefined,
    created_at: ensureString(record.created_at) || undefined,
    updated_at: ensureString(record.updated_at) || undefined,
  };
}

export function normalizeResponseTimes(raw: unknown): Array<{
  incident_type: string;
  avg_seconds: number;
  min_seconds: number;
  max_seconds: number;
  count: number;
}> {
  return ensureArray<Record<string, unknown>>(raw).map((item) => ({
    incident_type: ensureString(item.incident_type),
    avg_seconds: ensureNumber(item.avg_seconds),
    min_seconds: ensureNumber(item.min_seconds),
    max_seconds: ensureNumber(item.max_seconds),
    count: ensureNumber(item.count),
  }));
}

export function titleCase(str: string | undefined | null): string {
  if (!str) return "";
  return str.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatSeconds(seconds: number): string {
  if (seconds <= 0) return "No data";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (minutes === 0) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
}

function parseTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function deriveRegionFromCoordinates(latitude: number, longitude: number): string {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "Unknown";
  if (latitude > 5.65) return "Northern Accra";
  if (latitude > 5.55 && longitude < -0.22) return "Western Accra";
  if (latitude > 5.55 && longitude >= -0.22) return "Eastern Accra";
  return "Southern Accra";
}

export function averageResponseTimeFromIncidents(incidents: Incident[]): number {
  if (!Array.isArray(incidents) || incidents.length === 0) return 0;
  const diffs = incidents
    .map((incident) => {
      const created = parseTimestamp(incident.created_at);
      const dispatched = parseTimestamp(incident.dispatched_at);
      if (created === null || dispatched === null || dispatched < created) return null;
      return Math.max(1, Math.round((dispatched - created) / 1000));
    })
    .filter((value): value is number => value !== null);

  if (diffs.length === 0) return 0;
  const total = diffs.reduce((sum, value) => sum + value, 0);
  return total / diffs.length;
}

export function incidentsByRegionFromIncidents(
  incidents: Incident[],
): Array<{ region: string; incident_type: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const incident of incidents) {
    const region = deriveRegionFromCoordinates(incident.latitude, incident.longitude);
    const type = incident.incident_type || "unknown";
    const key = `${region}::${type}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return Object.entries(counts)
    .map(([key, count]) => {
      const [region, incident_type] = key.split("::");
      return { region, incident_type, count };
    })
    .sort((a, b) => b.count - a.count);
}

export function mergeIncidentRecord(incidents: Incident[], incoming: Incident): Incident[] {
  const next = normalizeIncident(incoming);
  if (!next) return incidents;
  const index = incidents.findIndex((i) => i.id === next.id);
  if (index >= 0) {
    return incidents.map((i, idx) => (idx === index ? { ...i, ...next } : i));
  }
  return [next, ...incidents];
}

export function extractEnvelopeData(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const envelope = payload as Record<string, unknown>;
  const data = envelope.data ?? envelope;
  if (!data || typeof data !== "object") return null;
  return data as Record<string, unknown>;
}
