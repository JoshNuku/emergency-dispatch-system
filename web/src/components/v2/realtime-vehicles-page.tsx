"use client";

import { useMemo, useState } from "react";
import { useDashboardStore, dashboardStore } from "@/store/dashboard-store";
import OperationsMap from "@/components/operations-map";
import { titleCase } from "@/lib/normalizers";
import type { Vehicle } from "@/types/frontend";

const VEHICLE_TYPE_OPTIONS = [
  { value: "ambulance", label: "Ambulance" },
  { value: "fire_truck", label: "Fire Truck" },
  { value: "police_car", label: "Police Car" },
];

function TypeToggle({ value, label, active, onToggle }: { value: string; label: string; active: boolean; onToggle: (v: string) => void; }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(value)}
      className={`rounded-md px-3 py-1 text-[12px] font-medium ${active ? "bg-accent text-white" : "bg-panel-strong text-muted border border-line"}`}
    >
      {label}
    </button>
  );
}

export default function RealtimeVehiclesPage() {
  const { state } = useDashboardStore();
  const vehicles: Vehicle[] = useMemo(() => (Array.isArray(state.vehicles) ? state.vehicles : []), [state.vehicles]);

  const [filters, setFilters] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    VEHICLE_TYPE_OPTIONS.forEach((o) => (m[o.value] = true));
    return m;
  });

  const toggleFilter = (t: string) => setFilters((f) => ({ ...f, [t]: !f[t] }));

  const filtered = useMemo(() => vehicles.filter((v) => filters[v.vehicle_type] ?? true), [vehicles, filters]);

  const mapPoints = useMemo(() =>
    filtered
      .map((v) => ({
        id: v.id,
        label: v.license_plate || v.id.slice(0, 8),
        detail: `${titleCase(v.vehicle_type)} · ${titleCase(v.status)}`,
        latitude: v.latitude,
        longitude: v.longitude,
        tone: "vehicle" as const,
      }))
      .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)),
  [filtered]);

  const lastUpdate = useMemo(() => {
    const times = vehicles
      .map((v) => (v.updated_at ? Date.parse(String(v.updated_at)) : 0))
      .filter((t) => Number.isFinite(t) && t > 0);
    if (times.length === 0) return null;
    return new Date(Math.max(...times));
  }, [vehicles]);

  function centerOnVehicle(id: string) {
    dashboardStore.setState({ selectedVehicleID: id });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="border-b border-line px-5 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-[14px] font-semibold text-foreground">Real-time Vehicle Tracking</h1>
            <p className="mt-1 text-[12px] text-muted">Live positions for ambulances, fire trucks, and police vehicles.</p>
          </div>
          <div className="flex items-center gap-2">
            {VEHICLE_TYPE_OPTIONS.map((o) => (
              <TypeToggle key={o.value} value={o.value} label={o.label} active={!!filters[o.value]} onToggle={toggleFilter} />
            ))}
          </div>
        </div>

        <div className="h-[640px]">
          <OperationsMap className="h-full w-full" points={mapPoints} />
        </div>

        <div className="px-5 py-2 text-xs text-muted">{lastUpdate ? `Last vehicle update: ${lastUpdate.toLocaleTimeString()}` : "No update timestamp available"}</div>
      </div>

      <aside className="overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-[13px] font-semibold text-foreground">Units ({filtered.length})</h2>
        </div>
        <div className="divide-y divide-line max-h-[640px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-5 text-[12px] text-muted">No units matching filters.</div>
          ) : (
            filtered.map((v) => (
              <div key={v.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-[13px] font-semibold text-foreground truncate">{v.license_plate || v.id.slice(0, 8)}</div>
                      <div className="text-[11px] text-muted">{titleCase(v.vehicle_type)}</div>
                    </div>
                    <div className="mt-1 text-[11px] text-muted">{v.latitude.toFixed(4)}, {v.longitude.toFixed(4)}</div>
                    <div className="mt-1 text-[11px] text-muted">{titleCase(v.status)}</div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button type="button" onClick={() => centerOnVehicle(v.id)} className="rounded-md bg-accent px-3 py-1 text-[12px] font-medium text-white">Select</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
