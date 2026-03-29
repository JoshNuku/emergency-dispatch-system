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
  const liveIncidents = state.incidents ?? [];
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

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-panel px-6 py-5">
        <h1 className="text-[14px] font-semibold text-foreground">Analytics</h1>
        <p className="mt-1 text-[12px] text-muted">
          Operational performance and response-time tracking.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
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
    </div>
  );
}

