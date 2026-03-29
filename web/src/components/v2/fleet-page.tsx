/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useMemo, useState, useEffect } from "react";
import { dashboardStore, useDashboardStore } from "@/store/dashboard-store";
import { deleteVehicle, updateVehicle, createVehicle, getUsers } from "@/lib/api";
import ConfirmModal from "@/components/v2/ui/confirm-modal";

import OperationsMap from "@/components/operations-map";
import type { UserProfile } from "@/types/frontend";
import { titleCase, ensureArray } from "@/lib/normalizers";
import { VehicleModal } from "@/components/v2/ui/vehicle-modal";

type MapPoint = {
  id: string;
  label: string;
  detail: string;
  latitude: number
  longitude: number;
  tone: "incident" | "vehicle";
  vehicle_type?: string;
  icon?: string;
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className="inline-flex items-center rounded-md border border-line bg-panel-strong px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted"
    >
      {titleCase(status)}
    </span>
  );
}

export function FleetPage() {
  const { state, selectedVehicleID, token, loadingAction, users, actionError } = useDashboardStore();
  const vehicles = useMemo(() => state.vehicles ?? [], [state.vehicles]);
  const userList: UserProfile[] = users ?? [];
  const role = (state.profile?.role ?? "").toLowerCase();
  const canManageFleet =
    role === "system_admin" ||
    role === "hospital_admin" ||
    role === "police_admin" ||
    role === "fire_admin";
  const scopedStations = useMemo(
    () =>
      role === "system_admin"
        ? state.stations ?? []
        : (state.stations ?? []).filter((s) => s.id === state.profile?.station_id),
    [role, state.stations, state.profile?.station_id],
  );

  // drivers already assigned to vehicles
  const assignedDriverIds = new Set(
    vehicles
      .map((v) => v.driver_id)
      .filter((id): id is string => Boolean(id)),
  );

  const unassignedDrivers = userList.filter((u) => {
    const role = (u.role || "").toLowerCase();
    const isDriver = role.includes("driver") || role === "ambulance_driver" || role === "police_driver" || role === "fire_driver";
    return isDriver && !assignedDriverIds.has(u.id);
  });

  const existingPlates = vehicles.map((v) => v.license_plate).filter((p): p is string => Boolean(p));

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
        className={`rounded-md px-2 py-1 text-[11px] font-medium sm:px-3 sm:text-[12px] ${active ? "bg-accent text-white" : "bg-panel-strong text-muted border border-line"}`}
      >
        {label}
      </button>
    );
  }

  function normalizeVehicleType(raw?: string) {
    if (!raw || typeof raw !== "string") return "ambulance";
    const s = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
    if (s.includes("fire")) return "fire_truck";
    if (s.includes("police")) return "police_car";
    if (s.includes("ambul")) return "ambulance";
    // default to ambulance so there's a visible icon
    return "ambulance";
  }

  function stationTypeToVehicleTypes(stationType?: string) {
    if (!stationType) return VEHICLE_TYPE_OPTIONS.map((o) => o.value);
    switch (stationType) {
      case "hospital":
        return ["ambulance"];
      case "fire":
        return ["fire_truck"];
      case "police":
        return ["police_car"];
      default:
        return VEHICLE_TYPE_OPTIONS.map((o) => o.value);
    }
  }

  function labelForVehicleType(value: string) {
    const found = VEHICLE_TYPE_OPTIONS.find((o) => o.value === value);
    if (found) return found.label;
    return titleCase(value.replaceAll("_", " "));
  }

  function vehicleTypeToDriverRole(vehicleType?: string) {
    switch (vehicleType) {
      case "ambulance":
        return "ambulance_driver";
      case "fire_truck":
        return "fire_driver";
      case "police_car":
        return "police_driver";
      default:
        return "";
    }
  }

  function getDriversForVehicleType(vehicleType?: string) {
    const requiredRole = vehicleTypeToDriverRole(vehicleType);
      const drivers = userList.filter((u) => {
      const userRole = (u.role || "").toLowerCase();
      if (!requiredRole) {
        return userRole.includes("driver");
      }
      return userRole === requiredRole;
    });

    return drivers;
  }

  function getStationsForVehicleType(vehicleType?: string) {
    const allStations = scopedStations;
    switch (vehicleType) {
      case "ambulance":
        return allStations.filter((s) => s.type === "hospital");
      case "fire_truck":
        return allStations.filter((s) => s.type === "fire");
      case "police_car":
        return allStations.filter((s) => s.type === "police");
      default:
        return allStations;
    }
  }

  // filters for vehicle types (show/hide per type)
  const [filters, setFilters] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    VEHICLE_TYPE_OPTIONS.forEach((o) => (m[o.value] = true));
    return m;
  });

  // filters are initialized from VEHICLE_TYPE_OPTIONS; no extra effect needed

  const filteredVehicles = useMemo(() => vehicles.filter((v) => filters[normalizeVehicleType(v.vehicle_type)]), [vehicles, filters]);

  const mapPoints = useMemo<MapPoint[]>(
    () =>
      filteredVehicles.map((v) => {
        const vt = normalizeVehicleType(v.vehicle_type);
        return {
          id: v.id,
          label: v.license_plate || "Unit",
          detail: titleCase(v.status),
          latitude: v.latitude,
          longitude: v.longitude,
          tone: "vehicle",
          vehicle_type: vt,
          icon: `icon-${vt}`,
        };
      }),
    [filteredVehicles],
  );

  const selectedVehicle =
    vehicles.find((v) => v.id === selectedVehicleID) ?? vehicles[0] ?? null;

  // Ensure users are loaded when visiting FleetPage so driver dropdowns populate
  useEffect(() => {
    if (!token) return;
    if (users && users.length > 0) return;
    void (async () => {
      try {
        const result = await getUsers(token);
        dashboardStore.setState({ users: ensureArray(result) });
      } catch {
        // ignore — AppShell handles errors when explicitly loading users
      }
    })();
  }, [token, users]);

  async function saveVehicle() {
    if (!token || !selectedVehicle) return;
    if (!canManageFleet) return;
    try {
      const updated = await updateVehicle(token, selectedVehicle.id, {
        license_plate: selectedVehicle.license_plate,
        driver_name: selectedVehicle.driver_name,
        driver_id: selectedVehicle.driver_id,
        station_id: selectedVehicle.station_id,
        station_type: selectedVehicle.station_type,
        vehicle_type: selectedVehicle.vehicle_type,
      });
      dashboardStore.setState((c) => ({
        state: {
          ...c.state,
          vehicles: c.state.vehicles.map((v) =>
            v.id === selectedVehicle.id ? { ...v, ...updated } : v,
          ),
        },
        actionNotice: "Vehicle updated.",
      }));
    } catch (error) {
      dashboardStore.setState({
        actionError:
          error instanceof Error ? error.message : "Failed to update vehicle",
      });
    }
  }

  // kept for compatibility; prefer ConfirmModal flow implemented below

  // local state for modal-driven deletion and create
  const [pendingDeleteVehicle, setPendingDeleteVehicle] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  async function confirmRemoveVehicle() {
    if (!token || !pendingDeleteVehicle) return;
    if (!canManageFleet) return;
    try {
      dashboardStore.setState({ loadingAction: { kind: "delete-user", userID: pendingDeleteVehicle } as any });
      await deleteVehicle(token, pendingDeleteVehicle);
      dashboardStore.setState((c) => ({
        state: {
          ...c.state,
          vehicles: c.state.vehicles.filter((v) => v.id !== pendingDeleteVehicle),
        },
        actionNotice: "Vehicle deleted.",
        loadingAction: { kind: "idle" },
      }));
      setPendingDeleteVehicle(null);
    } catch (error) {
      dashboardStore.setState({
        actionError: error instanceof Error ? error.message : "Failed to delete vehicle",
        loadingAction: { kind: "idle" },
      });
    }
  }

  function cancelRemoveVehicle() {
    setPendingDeleteVehicle(null);
  }

  // Create vehicle from modal or programmatic input. Expects `station_id` to be provided.
  async function handleCreateVehicle(input: any) {
    if (!token) return;
    if (!canManageFleet) return;
    setCreating(true);
    try {
      const payload = {
        license_plate: input.license_plate ?? selectedVehicle?.license_plate ?? "NEW-UNIT",
        vehicle_type: input.vehicle_type ?? selectedVehicle?.vehicle_type ?? "ambulance",
        station_id: input.station_id ?? (selectedVehicle as any)?.station_id,
        station_type: input.station_type ?? selectedVehicle?.station_type ?? "hospital",
        driver_id: input.driver_id ?? selectedVehicle?.driver_id ?? undefined,
        driver_name: input.driver_name ?? selectedVehicle?.driver_name ?? undefined,
        latitude: input.latitude ?? selectedVehicle?.latitude ?? 0,
        longitude: input.longitude ?? selectedVehicle?.longitude ?? 0,
      } as any;

      const created = await createVehicle(token, payload);
      dashboardStore.setState((c) => ({
        state: { ...c.state, vehicles: [created, ...c.state.vehicles] },
        actionNotice: "Vehicle created.",
      }));
      setIsAddModalOpen(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to create vehicle";
      dashboardStore.setState({ actionError: msg });
      throw error;
    } finally {
      setCreating(false);
    }
  }

  function updateSelectedField(field: string, value: string) {
    if (!selectedVehicle) return;
    dashboardStore.setState((c) => ({
      state: {
        ...c.state,
        vehicles: c.state.vehicles.map((v) =>
          v.id === selectedVehicle.id ? { ...v, [field]: value } : v,
        ),
      },
    }));
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-[14px] font-semibold text-foreground">Fleet</h1>
            <p className="mt-1 text-[12px] text-muted">Track active units, statuses, and last known positions.</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-1.5 lg:w-auto lg:justify-end lg:gap-2">
            {VEHICLE_TYPE_OPTIONS.map((o) => (
              <TypeToggle key={o.value} value={o.value} label={o.label} active={!!filters[o.value]} onToggle={(v) => setFilters((f) => ({ ...f, [v]: !f[v] }))} />
            ))}
          </div>
        </div>
        <div className="h-[520px]">
          <OperationsMap className="h-full w-full" points={mapPoints} />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-[13px] font-semibold text-foreground">Units ({filteredVehicles.length})</h2>
          <div className="flex items-center gap-2">
            {canManageFleet && (
              <>
                <button
                  type="button"
                  onClick={() => dashboardStore.setState({ openModal: "vehicle-command" })}
                  className="rounded-md border border-line bg-panel-strong px-3 py-1 text-[12px] font-medium text-muted hover:text-foreground"
                >
                  Manage
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  disabled={creating}
                  className="rounded-md border border-line bg-accent px-3 py-1 text-[12px] font-medium text-white hover:bg-accent/90"
                >
                  {creating ? "Creating…" : "Add Vehicle"}
                </button>
              </>
            )}
          </div>
        </div>
        <div className="divide-y divide-line">
          {filteredVehicles.length === 0 ? (
            <div className="px-5 py-6 text-[12px] text-muted">
              No vehicles loaded yet.
            </div>
          ) : (
            filteredVehicles.slice(0, 50).map((v) => (
              <div
                key={v.id}
                className={`w-full px-5 py-4 text-left ${selectedVehicleID === v.id ? "bg-panel-strong" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      dashboardStore.setState({ selectedVehicleID: v.id })
                    }
                    className="min-w-0 text-left"
                  >
                    <p className="truncate text-[13px] font-semibold text-foreground">
                      {v.license_plate || v.id}
                    </p>
                    <p className="mt-1 text-[11px] text-muted">
                      {titleCase(v.vehicle_type)} · {titleCase(v.station_type)}
                    </p>
                    <p className="mt-2 text-[11px] text-muted">
                      {v.latitude.toFixed(4)}, {v.longitude.toFixed(4)}
                    </p>
                  </button>
                  <div className="flex items-center gap-2">
                    <StatusPill status={v.status} />
                    {canManageFleet && (
                      <button
                        type="button"
                        onClick={() => setPendingDeleteVehicle(v.id)}
                        className="rounded-md border border-danger/20 bg-danger/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-danger"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        {selectedVehicle && canManageFleet && (
          <div className="border-t border-line px-5 py-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Edit selected vehicle
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={selectedVehicle.license_plate ?? ""}
                onChange={(e) =>
                  updateSelectedField("license_plate", e.target.value)
                }
                placeholder="License plate"
                className="rounded-lg border border-line bg-background px-3 py-2 text-[12px] text-foreground"
              />
              {/* Station selector */}
              <select
                value={selectedVehicle.station_id ?? ""}
                onChange={(e) => {
                  const stationId = e.target.value;
                  const station = scopedStations.find((s) => s.id === stationId);
                  updateSelectedField("station_id", stationId);
                  if (station) {
                    updateSelectedField("station_type", station.type);
                  }
                }}
                className="rounded-lg border border-line bg-background px-3 py-2 text-[12px] text-foreground"
              >
                <option value="">Select station...</option>
                {getStationsForVehicleType(selectedVehicle.vehicle_type).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.type})
                  </option>
                ))}
              </select>
              {/* Driver selector */}
              <select
                value={selectedVehicle.driver_id ?? ""}
                onChange={(e) => {
                  const userId = e.target.value;
                  const user = userList.find((u) => u.id === userId);
                  updateSelectedField("driver_id", userId);
                  updateSelectedField("driver_name", user ? user.name : "");
                }}
                className="rounded-lg border border-line bg-background px-3 py-2 text-[12px] text-foreground"
              >
                <option value="">
                  {selectedVehicle.driver_name
                    ? selectedVehicle.driver_name
                    : "Unassigned"}
                </option>
                {(() => {
                  const drivesForType = getDriversForVehicleType(selectedVehicle.vehicle_type);
                  const currentAssigned = selectedVehicle.driver_id
                    ? userList.find((u) => u.id === selectedVehicle.driver_id)
                    : null;
                  const withCurrent = currentAssigned && !drivesForType.some((u) => u.id === currentAssigned.id)
                    ? [currentAssigned, ...drivesForType]
                    : drivesForType;
                  const filtered = withCurrent.filter((u) => {
                    const isAssigned = assignedDriverIds.has(u.id);
                    return !isAssigned || u.id === selectedVehicle.driver_id;
                  });
                  return filtered.length > 0 ? (
                    filtered.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))
                  ) : (
                    <option disabled>No drivers available</option>
                  );
                })()}
              </select>
              <select
                value={selectedVehicle.vehicle_type}
                onChange={(e) =>
                  updateSelectedField("vehicle_type", e.target.value)
                }
                className="rounded-lg border border-line bg-background px-3 py-2 text-[12px] text-foreground"
              >
                {(() => {
                  const allowed = stationTypeToVehicleTypes(selectedVehicle.station_type);
                  const options = VEHICLE_TYPE_OPTIONS.filter((o) => allowed.includes(o.value));
                  if (!options.find((o) => o.value === selectedVehicle.vehicle_type)) {
                    options.unshift({ value: selectedVehicle.vehicle_type, label: labelForVehicleType(selectedVehicle.vehicle_type) });
                  }
                  return options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ));
                })()}
              </select>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => void saveVehicle()}
                className="rounded-lg bg-accent px-4 py-2 text-[12px] font-semibold text-white"
              >
                Save vehicle
              </button>
            </div>
            {actionError && (
              <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[12px] text-danger">
                {actionError}
              </p>
            )}
          </div>
        )}
        <ConfirmModal
          open={!!pendingDeleteVehicle}
          title="Delete vehicle"
          description="Are you sure you want to delete this vehicle? This action cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          loading={loadingAction.kind === "delete-user" && (loadingAction as any).userID === pendingDeleteVehicle}
          onConfirm={() => void confirmRemoveVehicle()}
          onCancel={() => cancelRemoveVehicle()}
        />
        <VehicleModal
          open={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onSave={handleCreateVehicle}
          stations={scopedStations}
          drivers={unassignedDrivers}
          existingPlates={existingPlates}
          loading={creating}
        />
      </div>
    </div>
  );
}

