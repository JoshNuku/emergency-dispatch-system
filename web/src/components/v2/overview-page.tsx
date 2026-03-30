"use client";

import { useMemo, useState, useRef, useEffect, type CSSProperties } from "react";

import {
  AlertTriangleIcon,
  ActivityIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  MapPinIcon,
} from "@/components/v2/icons";
import OperationsMap from "@/components/operations-map";
import { useRealtimeEvents } from "@/hooks/use-realtime-events";
import { updateIncidentStatus } from "@/lib/api";
import { averageResponseTimeFromIncidents, formatSeconds, titleCase } from "@/lib/normalizers";
import { dashboardStore, useDashboardStore } from "@/store/dashboard-store";
import type { Incident, Vehicle, Station } from "@/types/frontend";
import { Card, CardBody, CardHeader } from "@/components/v2/ui/card";
// @ts-expect-error react-window types may not align with current React version in this project
import { FixedSizeList as List } from "react-window";

// ── Type helpers ─────────────────────────────────────────────────────────────
function getTitle(i: Incident): string {
  return i.notes?.trim() || `${titleCase(i.incident_type)} incident`;
}

function getType(i: Incident): string {
  return titleCase(i.incident_type);
}

function getDescription(i: Incident): string {
  const parts: string[] = [`Reported by ${i.citizen_name}`];
  if (i.citizen_phone) parts.push(`(${i.citizen_phone})`);
  if (i.notes) parts.push(`— ${i.notes}`);
  return parts.join(" ");
}

function getStatus(i: Incident): string {
  return titleCase(i.status);
}

function isAdminRole(role?: string): boolean {
  return role === "system_admin" || role === "hospital_admin" || role === "police_admin" || role === "fire_admin";
}

function isDriverRole(role?: string): boolean {
  return role === "ambulance_driver" || role === "police_driver" || role === "fire_driver" || role === "driver";
}

function isTransitionAllowedForRole(role: string | undefined, fromStatus: string, toStatus: string): boolean {
  if (fromStatus === toStatus) return true;
  if (isAdminRole(role)) return true;
  if (isDriverRole(role)) return fromStatus === "dispatched" && toStatus === "in_progress";
  return false;
}

function getAdminNextStatuses(currentStatus: string): string[] {
  if (currentStatus === "created") return ["dispatched", "resolved"];
  if (currentStatus === "dispatched") return ["in_progress", "resolved"];
  if (currentStatus === "in_progress") return ["resolved"];
  return [];
}

function getCoords(
  i: Incident,
): { latitude: number; longitude: number } | null {
  const lat = i.latitude;
  const lng = i.longitude;
  if (typeof lat === "number" && typeof lng === "number")
    return { latitude: lat, longitude: lng };
  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

// KPI Card
type KpiCardProps = { label: string; value: string; description: string };

function KpiCard({ label, value, description }: KpiCardProps) {
  return (
    <Card className="hover:border-line-strong transition-colors">
      <CardBody className="py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {label}
        </p>
        <p className="mt-3 text-[32px] font-semibold leading-none tracking-tight text-foreground">
          {value}
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          {description}
        </p>
      </CardBody>
    </Card>
  );
}

// Incident type badge
function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className="inline-flex items-center rounded-md border border-line bg-panel-strong px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted"
    >
      {titleCase(type)}
    </span>
  );
}

// Live status dot
function StatusDot({ status }: { status: string }) {
  const resolved = status.toLowerCase() === "resolved";
  return (
    <span
      className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
        resolved
          ? "bg-signal"
          : "animate-pulse bg-warning shadow-[0_0_5px_rgba(255,205,41,0.55)]"
      }`}
    />
  );
}

// Individual incident card with expand/collapse
function IncidentCard({
  incident,
  onFocus,
  role,
  isUpdating,
  onStatusChange,
}: {
  incident: Incident;
  onFocus?: (incident: Incident) => void;
  role?: string;
  isUpdating?: boolean;
  onStatusChange?: (incidentID: string, status: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const status = getStatus(incident);
  const title = getTitle(incident);
  const type = getType(incident);
  const description = getDescription(incident);
  const { state: ds } = useDashboardStore();
  const vehiclesFromStore: Vehicle[] = Array.isArray(ds.vehicles) ? ds.vehicles : [];
  const stationsFromStore: Station[] = Array.isArray(ds.stations) ? ds.stations : [];
  let unit = "Unassigned";
  if (incident.assigned_unit_id) {
    const assignedVeh = vehiclesFromStore.find((v) =>
      v.id === incident.assigned_unit_id ||
      (v.license_plate && v.license_plate.toLowerCase() === incident.assigned_unit_id?.toLowerCase()),
    );
    if (assignedVeh) {
      unit = assignedVeh.license_plate || titleCase(assignedVeh.vehicle_type);
    } else {
      // Try finding a station (hospital/police/fire) by ID and show its name
      const assignedStation = stationsFromStore.find((s) => s.id === incident.assigned_unit_id);
      if (assignedStation) {
        unit = assignedStation.name || titleCase(assignedStation.type || "station");
      } else if (incident.assigned_unit_type) {
        unit = titleCase(incident.assigned_unit_type);
      } else {
        unit = incident.assigned_unit_id;
      }
    }
  }

  const currentStatus = (incident.status || "").toLowerCase();
  const isAdmin = isAdminRole(role);
  const isDriver = isDriverRole(role);
  const adminActions = isAdmin ? getAdminNextStatuses(currentStatus) : [];

  return (
    <div className="w-full rounded-xl border border-line bg-panel p-4 text-left transition-colors duration-100 hover:border-line-strong">
      <button
        type="button"
        onClick={() => {
          setExpanded((p) => !p);
          onFocus?.(incident);
        }}
        className="w-full text-left focus-visible:outline-2 focus-visible:outline-accent"
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <StatusDot status={status} />
            <TypeBadge type={type} />
          </div>
          <div className="flex shrink-0 items-center gap-1 text-[11px] text-muted">
            <span>{status}</span>
            {expanded ? (
              <ChevronDownIcon className="h-3 w-3" />
            ) : (
              <ChevronRightIcon className="h-3 w-3" />
            )}
          </div>
        </div>

        {/* Title */}
        <p className="mt-2.5 text-[13px] font-semibold leading-snug text-foreground">
          {title}
        </p>

        {/* Description — truncated or full */}
        <p
          className={`mt-1 text-[12px] leading-relaxed text-muted ${expanded ? "" : "line-clamp-2"}`}
        >
          {description}
        </p>

        {/* Expanded detail rows */}
        {expanded && (
          <div className="mt-3 space-y-2 border-t border-line/60 pt-3">
            {incident.citizen_phone && (
              <div className="flex gap-3 text-[12px]">
                <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Phone
                </span>
                <span className="text-foreground">{incident.citizen_phone}</span>
              </div>
            )}
            {typeof incident.latitude === "number" && (
              <div className="flex gap-3 text-[12px]">
                <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Location
                </span>
                <span className="text-foreground">
                  {incident.latitude.toFixed(4)}, {incident.longitude.toFixed(4)}
                </span>
              </div>
            )}
            {incident.dispatched_at && (
              <div className="flex gap-3 text-[12px]">
                <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Dispatched
                </span>
                <span className="text-foreground">
                  {new Date(incident.dispatched_at).toLocaleTimeString()}
                </span>
              </div>
            )}
            {incident.incident_type && (
              <div className="flex gap-3 text-[12px]">
                <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Type
                </span>
                <span className="text-foreground">
                  {titleCase(incident.incident_type)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5 text-[11px]">
          <span className="text-muted">
            Unit: <span className="font-medium text-foreground">{unit}</span>
          </span>
          {!expanded && <span className="font-medium text-accent">Details</span>}
        </div>
      </button>

      {(isAdmin || isDriver) && (
        <div className="mt-3 border-t border-line/60 pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">Incident Actions</p>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin &&
              adminActions.map((nextStatus) => (
                <button
                  key={nextStatus}
                  type="button"
                  disabled={
                    isUpdating ||
                    !isTransitionAllowedForRole(role, currentStatus, nextStatus)
                  }
                  onClick={() => {
                    void onStatusChange?.(incident.id, nextStatus);
                  }}
                  className="rounded-lg border border-line px-3 py-1.5 text-[11px] font-semibold text-foreground transition hover:bg-panel-strong disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {isUpdating ? "Updating..." : `Mark ${titleCase(nextStatus)}`}
                </button>
              ))}

            {isDriver && currentStatus === "dispatched" && (
              <button
                type="button"
                disabled={
                  isUpdating ||
                  !isTransitionAllowedForRole(role, currentStatus, "in_progress")
                }
                onClick={() => {
                  if (currentStatus === "dispatched") {
                    void onStatusChange?.(incident.id, "in_progress");
                  }
                }}
                className="rounded-lg border border-line px-3 py-1.5 text-[11px] font-semibold text-foreground transition hover:bg-panel-strong disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isUpdating ? "Updating..." : "Mark In Progress"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Response-time card
type ResponseCardProps = {
  label: string;
  value: string;
  detail: string;
  tone: "signal" | "warning" | "danger";
};

function ResponseCard({ label, value, detail, tone }: ResponseCardProps) {
  void tone;
  return (
    <div className="rounded-xl border border-line bg-panel py-4 pl-4 pr-5">
      <div className="flex items-center gap-1.5">
        <ClockIcon className="h-3.5 w-3.5 text-muted" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {label}
        </span>
      </div>
      <p className="mt-2 text-[22px] font-bold text-foreground">{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">{detail}</p>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function OverviewPage() {
  const { state, token, loadingAction } = useDashboardStore();
  const setStore = dashboardStore.setState;
  const { status: realtimeStatus } = useRealtimeEvents(token);
  const currentRole = state.profile?.role;

  async function handleIncidentTransition(incidentID: string, nextStatus: string) {
    if (!token) return;
    setStore({ loadingAction: { kind: "incident-status", incidentID, status: nextStatus }, actionError: null, actionNotice: null });
    try {
      const updated = await updateIncidentStatus(token, incidentID, nextStatus);
      setStore((c) => ({
        state: {
          ...c.state,
          incidents: c.state.incidents.map((incident) =>
            incident.id === incidentID ? { ...incident, ...updated } : incident,
          ),
        },
        loadingAction: { kind: "idle" },
        actionNotice: `Incident moved to ${titleCase(nextStatus)}.`,
      }));
    } catch (error) {
      setStore({
        loadingAction: { kind: "idle" },
        actionError: error instanceof Error ? error.message : "Failed to update incident status",
      });
    }
  }

  const safeIncidents = useMemo(
    () => (Array.isArray(state.incidents) ? state.incidents : []),
    [state.incidents],
  );
  const dispatches = useMemo(
    () => safeIncidents.filter((incident) => (incident.status ?? "").toLowerCase() !== "resolved"),
    [safeIncidents],
  );
  const historicalIncidentCount = useMemo(() => {
    const dashboardCount = state.dashboard?.total_incidents ?? 0;
    return Math.max(dashboardCount, safeIncidents.length);
  }, [state.dashboard?.total_incidents, safeIncidents.length]);
  const activeIncidentCount = dispatches.length;
  const assignedIncidentCount = useMemo(
    () => safeIncidents.filter((incident) => Boolean(incident.assigned_unit_id)).length,
    [safeIncidents],
  );
  const safeVehicles: Vehicle[] = useMemo(
    () => (Array.isArray(state.vehicles) ? state.vehicles : []),
    [state.vehicles],
  );
  const onlineVehicleCount = useMemo(
    () =>
      safeVehicles.filter((vehicle) =>
        ["available", "en_route", "at_scene"].includes((vehicle.status ?? "").toLowerCase()),
      ).length,
    [safeVehicles],
  );
  const safeResponseTimes = useMemo(
    () => (Array.isArray(state.responseTimes) ? state.responseTimes : []),
    [state.responseTimes],
  );
  const fallbackAvgResponseSeconds = useMemo(
    () => averageResponseTimeFromIncidents(safeIncidents),
    [safeIncidents],
  );

  // ── KPI data ──────────────────────────────────────────────────────────────
  const kpis = useMemo<KpiCardProps[]>(() => {
    const d = state.dashboard;
    return [
      {
        label: "Active Incidents",
        value: String(activeIncidentCount),
        description:
          "Currently open incidents (created, dispatched, or in progress).",
      },
      {
        label: "Avg. Response Time",
        value:
          d && d.avg_response_time_seconds > 0
            ? formatSeconds(d.avg_response_time_seconds)
            : formatSeconds(fallbackAvgResponseSeconds),
        description:
          "Computed from incident dispatch and responder arrival timings.",
      },
      {
        label: "Active Vehicles",
        value: String(safeVehicles.length),
        description:
          `Vehicles currently visible through dispatch. Historical incidents: ${historicalIncidentCount}.`,
      },
    ];
  }, [state.dashboard, safeVehicles.length, activeIncidentCount, fallbackAvgResponseSeconds, historicalIncidentCount]);

  const listRef = useRef<HTMLDivElement | null>(null);
  const [listHeight, setListHeight] = useState<number>(420);
  const [mapFocus, setMapFocus] = useState<{
    latitude: number;
    longitude: number;
    zoom?: number;
  } | null>(null);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const setH = () => {
      try {
        setListHeight(node.clientHeight || 420);
      } catch {
        /* ignore */
      }
    };
    setH();
    const ro = new ResizeObserver(() => setH());
    ro.observe(node);
    window.addEventListener("resize", setH);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", setH);
    };
  }, []);

  // ── Response time cards ────────────────────────────────────────────────────
  const responseTimes = useMemo<ResponseCardProps[]>(() => {
    if (safeResponseTimes.length === 0) return [];
    return safeResponseTimes.slice(0, 3).map((item, i) => ({
      label: titleCase(item.incident_type),
      value: formatSeconds(item.avg_seconds),
      detail: `${item.count} recorded dispatches. Fastest ${formatSeconds(item.min_seconds)}.`,
      tone: (["signal", "warning", "danger"] as const)[i] ?? "signal",
    }));
  }, [safeResponseTimes]);

  // ── Map points ─────────────────────────────────────────────────────────────
  const mapPoints = useMemo(() => {
    const incidentPts = dispatches
      .map((i) => {
        const coords = getCoords(i);
        if (!coords) return null;
        return {
          id: i.id,
          label: getTitle(i),
          detail: `${getType(i)} | ${getStatus(i)}`,
          latitude: coords.latitude,
          longitude: coords.longitude,
          tone: "incident" as const,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    const vehiclePts = safeVehicles
      .map((vehicle) => {
        if (typeof vehicle.latitude !== "number" || typeof vehicle.longitude !== "number") {
          return null;
        }
        return {
          id: `vehicle-${vehicle.id}`,
          label: vehicle.license_plate || titleCase(vehicle.vehicle_type),
          detail: `${titleCase(vehicle.status)}${vehicle.driver_name ? ` | ${vehicle.driver_name}` : ""}`,
          latitude: vehicle.latitude,
          longitude: vehicle.longitude,
          tone: "vehicle" as const,
          vehicle_type: vehicle.vehicle_type,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return [...incidentPts, ...vehiclePts];
  }, [dispatches, safeVehicles]);

  const liveCount = dispatches.length;
  const isLive = realtimeStatus === "live";

  // ── Queue health stats (shown as secondary KPI strip) ─────────────────────
  const queueStats = useMemo(
    () => [
      {
        label: "Total incidents",
        value: String(safeIncidents.length),
        detail: "All incident records currently returned by the incident API.",
      },
      {
        label: "Assigned incidents",
        value: String(assignedIncidentCount),
        detail: "Cases with a responder unit assignment on record.",
      },
      {
        label: "Vehicles online",
        value: String(onlineVehicleCount),
        detail: "Units reporting active operational statuses from dispatch.",
      },
    ],
    [assignedIncidentCount, onlineVehicleCount, safeIncidents.length],
  );

  return (
    <div>
      <div className="mx-auto max-w-360 space-y-6">
        <Card className="relative z-0">
          <CardHeader
            title="Overview"
            description="A high-level view of incidents, fleet posture, and live operational status."
          />
        </Card>
        {/* ── KPI grid ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {kpis.map((kpi) => (
            <KpiCard key={kpi.label} {...kpi} />
          ))}
        </div>

        {/* ── Queue health strip ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {queueStats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-start justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3"
            >
              <div>
                <p className="text-[11px] font-semibold text-muted">
                  {stat.label}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted/70">
                  {stat.detail}
                </p>
              </div>
              <span className="shrink-0 text-[20px] font-bold text-foreground">
                {stat.value}
              </span>
            </div>
          ))}
        </div>

        {/* ── Map + Dispatches ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
          {/* Map */}
          <section className="flex flex-col overflow-hidden rounded-2xl border border-line bg-panel">
            <div className="flex shrink-0 items-center justify-between border-b border-line px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/12 text-accent">
                  <MapPinIcon className="h-3.5 w-3.5" />
                </div>
                <h2 className="text-[13px] font-semibold text-foreground">
                  Live Operations Region
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isLive
                      ? "bg-signal shadow-[0_0_5px_rgba(20,174,92,0.7)]"
                      : "bg-muted"
                  }`}
                />
                <span className="rounded-full border border-line bg-panel-strong px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {mapPoints.length} tracking
                </span>
              </div>
            </div>
            <div className="relative h-[520px] w-full">
              <OperationsMap 
                className="h-full w-full" 
                points={mapPoints} 
                focusPoint={mapFocus ?? undefined}
                onMapClick={(coords) => {
                  setStore({ lastMapSelectedCoords: coords });
                }}
              />
            </div>
          </section>

          {/* Active Dispatches */}
          <section className="flex flex-col overflow-hidden rounded-2xl border border-line bg-panel">
            <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-panel-strong text-muted">
                  <AlertTriangleIcon className="h-3.5 w-3.5" />
                </div>
                <h2 className="text-[13px] font-semibold text-foreground">
                  Active Dispatches
                </h2>
              </div>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full border border-line bg-panel-strong px-1.5 text-[10px] font-semibold text-foreground">
                {liveCount}
              </span>
            </div>

            <div ref={listRef} className="app-scroll flex flex-1 flex-col gap-2.5 overflow-y-auto p-4">
              {dispatches.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-background">
                    <AlertTriangleIcon className="h-5 w-5 text-muted" />
                  </div>
                  <p className="text-[13px] font-medium text-foreground">No active incidents</p>
                  <p className="mt-1 text-[12px] text-muted">All clear in the operations region.</p>
                </div>
              ) : dispatches.length > 30 ? (
                <List height={listHeight} itemCount={dispatches.length} itemSize={140} width="100%">
                  {({ index, style }: { index: number; style: CSSProperties }) => {
                    const incident = dispatches[index];
                    return (
                      <div style={style} key={incident.id}>
                        <IncidentCard
                          incident={incident}
                          role={currentRole}
                          isUpdating={loadingAction.kind === "incident-status" && loadingAction.incidentID === incident.id}
                          onStatusChange={handleIncidentTransition}
                          onFocus={(selected) => {
                            setMapFocus({
                              latitude: selected.latitude,
                              longitude: selected.longitude,
                              zoom: 16,
                            });
                          }}
                        />
                      </div>
                    );
                  }}
                </List>
              ) : (
                dispatches.map((incident) => (
                  <IncidentCard
                    key={incident.id}
                    incident={incident}
                    role={currentRole}
                    isUpdating={loadingAction.kind === "incident-status" && loadingAction.incidentID === incident.id}
                    onStatusChange={handleIncidentTransition}
                    onFocus={(selected) => {
                      setMapFocus({
                        latitude: selected.latitude,
                        longitude: selected.longitude,
                        zoom: 16,
                      });
                    }}
                  />
                ))
              )}
            </div>
          </section>
        </div>

        {/* ── Response times band ──────────────────────────────────────── */}
        <div>
          <div className="mb-3 flex items-center gap-2 text-muted">
            <ActivityIcon className="h-3.5 w-3.5" />
            <h3 className="text-[11px] font-semibold uppercase tracking-wider">
              Response Targets
            </h3>
          </div>
          {responseTimes.length === 0 ? (
            <div className="rounded-xl border border-line bg-panel px-4 py-6 text-[12px] text-muted">
              No response-time analytics returned from the backend yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {responseTimes.map((card) => (
                <ResponseCard key={card.label} {...card} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
