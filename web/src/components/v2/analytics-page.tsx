"use client";

import { useMemo } from "react";

import {
  averageResponseTimeFromIncidents,
  formatSeconds,
  incidentsByRegionFromIncidents,
  titleCase,
} from "@/lib/normalizers";
import { useDashboardStore } from "@/store/dashboard-store";

function StatCard(props: { label: string; value: string; detail?: string }) {
  const { label, value, detail } = props;
  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="mt-3 text-[34px] font-bold leading-none tracking-tight text-foreground">
        {value}
      </p>
      {detail ? <p className="mt-2 text-[12px] text-muted">{detail}</p> : null}
    </div>
  );
}

export function AnalyticsPage() {
  const { state } = useDashboardStore();

  const dashboard = state.dashboard;
  const liveIncidents = useMemo(() => state.incidents ?? [], [state.incidents]);
  const allIncidentsCount = liveIncidents.length;
  const activeIncidentsCount = useMemo(
    () => liveIncidents.filter((incident) => (incident.status ?? "").toLowerCase() !== "resolved").length,
    [liveIncidents],
  );
  const fallbackAvgResponseSeconds = useMemo(
    () => averageResponseTimeFromIncidents(liveIncidents),
    [liveIncidents],
  );
  const effectiveAvgResponseSeconds =
    (dashboard?.avg_response_time_seconds ?? 0) > 0
      ? (dashboard?.avg_response_time_seconds ?? 0)
      : fallbackAvgResponseSeconds;
  const avgClosureSeconds = useMemo(() => {
    const resolved = liveIncidents.filter((incident) => {
      const status = String(incident.status || "").toLowerCase();
      return status === "resolved" || Boolean(incident.resolved_at);
    });

    const durations = resolved
      .map((incident) => {
        const created = Date.parse(incident.created_at || "");
        const closed = Date.parse(incident.resolved_at || incident.updated_at || "");
        if (!Number.isFinite(created) || !Number.isFinite(closed) || closed < created) return null;
        return Math.round((closed - created) / 1000);
      })
      .filter((value): value is number => value !== null);

    if (durations.length === 0) return 0;
    return durations.reduce((sum, seconds) => sum + seconds, 0) / durations.length;
  }, [liveIncidents]);
  const regionBreakdown = useMemo(() => {
    if ((state.incidentsByRegion ?? []).length > 0) return state.incidentsByRegion;
    return incidentsByRegionFromIncidents(liveIncidents);
  }, [state.incidentsByRegion, liveIncidents]);

  const historicalIncidentsCount = Math.max(dashboard?.total_incidents ?? 0, allIncidentsCount);

  const topTypes = useMemo(() => {
    // Prefer server-provided breakdown when available, otherwise derive from local incidents
    const serverTypes = dashboard?.incidents_by_type ?? [];
    if (serverTypes && serverTypes.length > 0) {
      return [...serverTypes].sort((a, b) => b.count - a.count).slice(0, 6);
    }
    const counts = (state.incidents || []).reduce((acc: Record<string, number>, inc) => {
      const t = inc.incident_type || "unknown";
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(counts)
      .map(([incident_type, count]) => ({ incident_type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [dashboard, state.incidents]);

  const pastIncidents = useMemo(() => {
    const toTime = (value?: string) => {
      const t = Date.parse(value || "");
      return Number.isFinite(t) ? t : 0;
    };
    return [...liveIncidents]
      .filter((incident) => {
        const status = String(incident.status || "").toLowerCase();
        return status === "resolved" || Boolean(incident.resolved_at);
      })
      .sort((a, b) => {
        const aTime = toTime(a.resolved_at) || toTime(a.updated_at) || toTime(a.created_at);
        const bTime = toTime(b.resolved_at) || toTime(b.updated_at) || toTime(b.created_at);
        return bTime - aTime;
      });
  }, [liveIncidents]);

  const stationNameByID = useMemo(() => {
    const map = new Map<string, string>();
    for (const station of state.stations || []) {
      const id = String(station.id || "").trim().toLowerCase();
      if (!id) continue;
      map.set(id, String(station.name || titleCase(station.type || "station")));
    }
    return map;
  }, [state.stations]);

  const vehicleAssignmentByIdentifier = useMemo(() => {
    const map = new Map<string, { plate: string; station: string }>();
    for (const vehicle of state.vehicles || []) {
      const id = String(vehicle.id || "").trim().toLowerCase();
      const plate = String(vehicle.license_plate || "").trim();
      const stationID = String(vehicle.station_id || "").trim().toLowerCase();
      const stationName = stationNameByID.get(stationID) || "-";
      if (!plate) continue;
      const data = { plate, station: stationName };
      if (id) map.set(id, data);
      map.set(plate.toLowerCase(), data);
    }
    return map;
  }, [state.vehicles, stationNameByID]);

  const formatWhen = (value?: string) => {
    if (!value) return "-";
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? new Date(ts).toLocaleString() : "-";
  };

  const durationBetween = (from?: string, to?: string) => {
    const fromTs = Date.parse(from || "");
    const toTs = Date.parse(to || "");
    if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || toTs < fromTs) return "-";
    const totalSeconds = Math.round((toTs - fromTs) / 1000);
    return formatSeconds(totalSeconds);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-panel px-6 py-5">
        <h1 className="text-[14px] font-semibold text-foreground">Analytics</h1>
        <p className="mt-1 text-[12px] text-muted">
          Operational performance and response-time tracking.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Active incidents"
          value={`${activeIncidentsCount}`}
          detail="Currently open (created, dispatched, or in progress)."
        />
        <StatCard
          label="Historical incidents"
          value={`${historicalIncidentsCount}`}
          detail="All incidents tracked so far, including resolved ones."
        />
        <StatCard
          label="Avg response time"
          value={formatSeconds(effectiveAvgResponseSeconds)}
          detail="Mean time-to-dispatch across incident types."
        />
        <StatCard
          label="Avg time to closure"
          value={formatSeconds(avgClosureSeconds)}
          detail="Average duration from incident creation to closure."
        />
        <StatCard
          label="Vehicles tracked"
          value={`${state.vehicles.length}`}
          detail="Units with telemetry visibility."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-panel">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[13px] font-semibold text-foreground">
              Incidents by type
            </h2>
          </div>
          <div className="divide-y divide-line">
            {topTypes.length === 0 ? (
              <div className="px-5 py-6 text-[12px] text-muted">
                No incident types tracked yet.
              </div>
            ) : (
              topTypes.map((t) => (
                <div key={t.incident_type} className="flex items-center justify-between px-5 py-4">
                  <p className="text-[12px] font-medium text-foreground">
                    {titleCase(t.incident_type)}
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] font-semibold text-foreground">
                      {t.count}
                    </span>
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line/40">
                      <div
                        className="h-full bg-accent"
                        style={{
                          width: `${Math.min(100, (t.count / (historicalIncidentsCount || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panel">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[13px] font-semibold text-foreground">
              Incidents by region
            </h2>
          </div>
          <div className="divide-y divide-line">
            {regionBreakdown.length === 0 ? (
              <div className="px-5 py-6 text-[12px] text-muted">
                No region data yet.
              </div>
            ) : (
              regionBreakdown.map((r) => (
                <div key={`${r.region}-${r.incident_type}`} className="flex items-center justify-between px-5 py-4">
                  <p className="text-[12px] font-medium text-foreground">
                    {titleCase(r.region)}
                  </p>
                  <p className="text-[12px] font-semibold text-foreground">
                    {r.count}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-panel">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[13px] font-semibold text-foreground">
            Resource utilization
          </h2>
        </div>
        <div className="grid grid-cols-1 divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
          {state.resourceUtilization.length === 0 ? (
            <div className="px-5 py-6 text-[12px] text-muted">
              No utilization metrics yet.
            </div>
          ) : (
            state.resourceUtilization.map((u) => (
              <div key={u.service_type} className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-medium text-foreground">
                    {titleCase(u.service_type)}
                  </p>
                  <p className="text-[12px] font-semibold text-foreground">
                    {isFinite(u.utilization_percent) ? Math.round(u.utilization_percent) : 0}%
                  </p>
                </div>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-line/40">
                  <div
                    className="h-full bg-accent transition-all duration-500"
                    style={{ width: `${isFinite(u.utilization_percent) ? Math.min(100, Math.max(0, u.utilization_percent)) : 0}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  {u.active_units} busy / {u.total_units} total units
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-panel">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[13px] font-semibold text-foreground">
            Past incidents
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            Detailed historical records for audit, review, and after-action analysis.
          </p>
        </div>
        <div className="divide-y divide-line">
          {pastIncidents.length === 0 ? (
            <div className="px-5 py-6 text-[12px] text-muted">
              No past incidents found yet.
            </div>
          ) : (
            pastIncidents.slice(0, 30).map((incident) => (
              <div key={incident.id} className="space-y-3 px-5 py-4">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[12px] font-semibold text-foreground">
                      {incident.citizen_name || "Unknown caller"}
                    </p>
                    <p className="text-[11px] text-muted">
                      {titleCase(incident.incident_type)} • ID {incident.id}
                    </p>
                  </div>
                  <span className="inline-flex w-fit rounded-full border border-line bg-panel-strong px-2 py-0.5 text-[11px] font-semibold text-foreground">
                    {titleCase(incident.status || "unknown")}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 text-[12px] md:grid-cols-3 xl:grid-cols-5">
                  <div>
                    <p className="text-[11px] text-muted">Caller phone</p>
                    <p className="font-medium text-foreground">{incident.citizen_phone || "-"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">Assigned unit</p>
                    <p className="font-medium text-foreground">
                      {(() => {
                        const assignedRaw = String(incident.assigned_unit_id || "").trim();
                        if (!assignedRaw) return "Unassigned";
                        const assignedKey = assignedRaw.toLowerCase();
                        return vehicleAssignmentByIdentifier.get(assignedKey)?.plate || assignedRaw;
                      })()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">Unit type</p>
                    <p className="font-medium text-foreground">{titleCase(incident.assigned_unit_type || "-")}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">Station</p>
                    <p className="font-medium text-foreground">
                      {(() => {
                        const assignedRaw = String(incident.assigned_unit_id || "").trim();
                        if (!assignedRaw) return "-";
                        const assignedKey = assignedRaw.toLowerCase();
                        return vehicleAssignmentByIdentifier.get(assignedKey)?.station || "-";
                      })()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">Location</p>
                    <p className="font-medium text-foreground">
                      {Number(incident.latitude).toFixed(4)}, {Number(incident.longitude).toFixed(4)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">Created</p>
                    <p className="font-medium text-foreground">{formatWhen(incident.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">Dispatched</p>
                    <p className="font-medium text-foreground">{formatWhen(incident.dispatched_at)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">Resolved</p>
                    <p className="font-medium text-foreground">{formatWhen(incident.resolved_at || incident.updated_at)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">Dispatch time</p>
                    <p className="font-medium text-foreground">{durationBetween(incident.created_at, incident.dispatched_at)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 text-[12px] md:grid-cols-2">
                  <div>
                    <p className="text-[11px] text-muted">Time to closure</p>
                    <p className="font-medium text-foreground">
                      {durationBetween(incident.created_at, incident.resolved_at || incident.updated_at)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">Notes</p>
                    <p className="font-medium text-foreground">{incident.notes || "-"}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

