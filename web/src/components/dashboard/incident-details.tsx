"use client";

import type { Incident } from "@/types/frontend";
import { useState } from "react";

import { updateIncidentStatus } from "@/lib/api";
import { dashboardStore } from "@/store/dashboard-store";
import { useDashboardStore } from "@/store/dashboard-store";

type StoreUpdate = Parameters<typeof dashboardStore.setState>[0];

export function IncidentDetails({ incidentId }: { incidentId: string }) {
  const { token, state, actionError } = useDashboardStore();
  const setStore = (update: StoreUpdate) => dashboardStore.setState(update);
  const incident = state.incidents.find((i) => i.id === incidentId);

  if (!incident) {
    return (
      <div className="text-zinc-500 text-sm py-8 text-center">
        Incident not found.
      </div>
    );
  }

  const [lastStatus, setLastStatus] = useState<string>(incident.status);

  const handleStatusChange = async (status: string) => {
    setLastStatus(status);
    setStore({
      loadingAction: { kind: "incident-status", incidentID: incidentId, status },
    });

    try {
      if (!token) throw new Error("Not authenticated.");

      const updated = await updateIncidentStatus(token, incidentId, status);

      setStore((c) => ({
        state: {
          ...c.state,
          incidents: c.state.incidents.map((i: Incident) =>
            i.id === incidentId ? { ...i, ...updated } : i,
          ),
        },
        loadingAction: { kind: "idle" },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update status";
      setStore({
        actionError: message,
        loadingAction: { kind: "idle" },
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-zinc-500 uppercase">
            Citizen
          </label>
          <div className="text-sm border-l-2 border-zinc-800 pl-3 py-1 font-medium">
            {incident.citizen_name}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-zinc-500 uppercase">
            Contact
          </label>
          <div className="text-sm border-l-2 border-zinc-800 pl-3 py-1 font-medium">
            {incident.citizen_phone || "N/A"}
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-zinc-500 uppercase">
          Event Description
        </label>
        <p className="text-sm text-zinc-400 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/50">
          {incident.notes || "No notes available."}
        </p>
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-zinc-500 uppercase">
          Status Lifecycle
        </label>
        <div className="grid grid-cols-3 gap-2">
          {["reported", "dispatched", "en_route", "at_scene", "resolved", "escalated"].map(
            (status) => (
              <button
                key={status}
                onClick={() => handleStatusChange(status)}
                className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition-all border ${
                  lastStatus === status
                    ? "bg-zinc-100 text-black border-zinc-100"
                    : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700"
                }`}
              >
                {status.replace("_", " ")}
              </button>
            ),
          )}
        </div>
      </div>
      {actionError && (
        <p className="text-xs text-red-500 font-medium">{actionError}</p>
      )}
    </div>
  );
}

