"use client";

import type { Vehicle } from "@/types/frontend";
import type { FormEvent } from "react";
import { useMemo } from "react";

import { updateVehicleLocation, updateVehicleStatus } from "@/lib/api";
import { dashboardStore } from "@/store/dashboard-store";
import { useDashboardStore } from "@/store/dashboard-store";

type StoreUpdate = Parameters<typeof dashboardStore.setState>[0];

export function VehicleControl() {
  const store = useDashboardStore();
  const { token, state, selectedVehicleID, vehicleStatus, vehicleLatitude, vehicleLongitude, actionError } =
    store;

  const setStore = (update: StoreUpdate) => dashboardStore.setState(update);

  const handleStatusSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedVehicleID) return;

    setStore({
      loadingAction: { kind: "vehicle-status", vehicleID: selectedVehicleID },
    });

    try {
      if (!token) throw new Error("Not authenticated.");

      const updated = await updateVehicleStatus(
        token,
        selectedVehicleID,
        vehicleStatus,
      );

      setStore((c) => ({
        state: {
          ...c.state,
          vehicles: c.state.vehicles.map((v: Vehicle) =>
            v.id === selectedVehicleID ? { ...v, ...updated } : v,
          ),
        },
        actionNotice: "Status updated.",
        loadingAction: { kind: "idle" },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update status";
      setStore({ actionError: message, loadingAction: { kind: "idle" } });
    }
  };

  const handleLocationSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedVehicleID) return;

    const lat = parseFloat(vehicleLatitude);
    const lng = parseFloat(vehicleLongitude);

    setStore({
      loadingAction: { kind: "vehicle-location", vehicleID: selectedVehicleID },
    });

    try {
      if (!token) throw new Error("Not authenticated.");

      const updated = await updateVehicleLocation(token, selectedVehicleID, lat, lng);

      setStore((c) => ({
        state: {
          ...c.state,
          vehicles: c.state.vehicles.map((v: Vehicle) =>
            v.id === selectedVehicleID
              ? { ...v, latitude: updated.latitude, longitude: updated.longitude, status: updated.status }
              : v,
          ),
        },
        actionNotice: "Location updated.",
        loadingAction: { kind: "idle" },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update location";
      setStore({ actionError: message, loadingAction: { kind: "idle" } });
    }
  };

  const vehicles = useMemo(() => state.vehicles ?? [], [state.vehicles]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-zinc-500 uppercase">
          Unit Selection
        </label>
        <select
          value={selectedVehicleID}
          onChange={(e) => setStore({ selectedVehicleID: e.target.value })}
          className="w-full h-10 bg-zinc-900 border border-zinc-800 rounded-lg px-3 text-sm outline-none"
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.license_plate || "Unassigned"} — {v.status.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      <form
        onSubmit={handleStatusSubmit}
        className="space-y-4 pt-4 border-t border-zinc-800"
      >
        <label className="text-[10px] font-bold text-zinc-500 uppercase">
          State Control
        </label>
        <div className="flex gap-2">
          <select
            value={vehicleStatus}
            onChange={(e) => setStore({ vehicleStatus: e.target.value })}
            className="flex-1 h-10 bg-zinc-900 border border-zinc-800 rounded-lg px-3 text-sm outline-none"
          >
            {["available", "dispatched", "en_route", "at_scene", "returning", "out_of_service"].map(
              (s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ").toUpperCase()}
                </option>
              ),
            )}
          </select>
          <button
            type="submit"
            className="px-4 h-10 bg-zinc-100 text-black text-[11px] font-bold uppercase rounded-lg"
          >
            Update
          </button>
        </div>
      </form>

      <form
        onSubmit={handleLocationSubmit}
        className="space-y-4 pt-4 border-t border-zinc-800"
      >
        <label className="text-[10px] font-bold text-zinc-500 uppercase">
          Telemetry Override
        </label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            step="0.0001"
            value={vehicleLatitude}
            onChange={(e) => setStore({ vehicleLatitude: e.target.value })}
            className="h-10 bg-zinc-900 border border-zinc-800 rounded-lg px-3 text-sm outline-none"
            placeholder="LAT"
          />
          <input
            type="number"
            step="0.0001"
            value={vehicleLongitude}
            onChange={(e) => setStore({ vehicleLongitude: e.target.value })}
            className="h-10 bg-zinc-900 border border-zinc-800 rounded-lg px-3 text-sm outline-none"
            placeholder="LNG"
          />
        </div>
        <button
          type="submit"
          className="w-full h-10 border border-zinc-800 hover:bg-zinc-900 text-[11px] font-bold uppercase rounded-lg transition-all"
        >
          Move Unit
        </button>
      </form>

      {actionError && <p className="text-xs text-red-500 font-medium">{actionError}</p>}
    </div>
  );
}

