"use client";

import type { CreateIncidentInput } from "@/types/frontend";
import type { FormEvent } from "react";

import { createIncident } from "@/lib/api";
import { LocationPicker } from "@/components/location-picker";
import { dashboardStore } from "@/store/dashboard-store";
import { useDashboardStore } from "@/store/dashboard-store";
import { mergeIncidentRecord, normalizeIncident } from "@/components/dashboard/dashboard-utils";

type StoreUpdate = Parameters<typeof dashboardStore.setState>[0];

export function NewIncidentForm() {
  const { token, incidentForm, loadingAction, actionError } = useDashboardStore();
  const setStore = (update: StoreUpdate) => dashboardStore.setState(update);

  const isCreating = loadingAction.kind === "create-incident";

  const handleFieldChange = <K extends keyof CreateIncidentInput>(
    field: K,
    value: CreateIncidentInput[K],
  ) => {
    setStore((c) => ({
      incidentForm: {
        ...c.incidentForm,
        [field]: value,
      },
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    setStore({
      actionError: null,
      actionNotice: null,
      loadingAction: { kind: "create-incident" },
    });

    try {
      if (!token) throw new Error("Not authenticated.");

      const created = await createIncident(token, {
        ...incidentForm,
        citizen_phone: incidentForm.citizen_phone || undefined,
        notes: incidentForm.notes || undefined,
      });

      const normalized = normalizeIncident(created.incident);

      if (normalized) {
        setStore((c) => ({
          state: {
            ...c.state,
            incidents: mergeIncidentRecord(c.state.incidents, normalized),
          },
        }));
      }

      setStore({
        incidentForm: {
          citizen_name: "",
          citizen_phone: "",
          incident_type: "medical",
          latitude: 5.6512,
          longitude: -0.1869,
          notes: "",
        },
        actionNotice: "Incident created.",
        openModal: null,
        loadingAction: { kind: "idle" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create incident";
      setStore({
        actionError: message,
        loadingAction: { kind: "idle" },
      });
    }
  };

  // Keep keys stable for controlled inputs.
  const citizenPhoneValue = incidentForm.citizen_phone ?? "";
  const notesValue = incidentForm.notes ?? "";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-zinc-500 uppercase">
            Citizen Name
          </label>
          <input
            value={incidentForm.citizen_name}
            onChange={(e) => handleFieldChange("citizen_name", e.target.value)}
            className="w-full h-10 bg-zinc-900 border border-zinc-800 rounded-lg px-3 text-sm focus:border-zinc-700 outline-none"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-zinc-500 uppercase">
            Phone
          </label>
          <input
            value={citizenPhoneValue}
            onChange={(e) => handleFieldChange("citizen_phone", e.target.value)}
            className="w-full h-10 bg-zinc-900 border border-zinc-800 rounded-lg px-3 text-sm focus:border-zinc-700 outline-none"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold text-zinc-500 uppercase">
          Type
        </label>
        <select
          value={incidentForm.incident_type}
          onChange={(e) => handleFieldChange("incident_type", e.target.value)}
          className="w-full h-10 bg-zinc-900 border border-zinc-800 rounded-lg px-3 text-sm focus:border-zinc-700 outline-none"
        >
          <option value="medical">Medical</option>
          <option value="fire">Fire</option>
          <option value="crime">Crime</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold text-zinc-500 uppercase">
          Location Mapping
        </label>
        <div className="h-48 rounded-xl border border-zinc-800 overflow-hidden">
          <LocationPicker
            latitude={incidentForm.latitude}
            longitude={incidentForm.longitude}
            onLocationSelect={(lat, lng) => {
              handleFieldChange("latitude", lat);
              handleFieldChange("longitude", lng);
            }}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold text-zinc-500 uppercase">
          Incident Notes
        </label>
        <textarea
          value={notesValue}
          onChange={(e) => handleFieldChange("notes", e.target.value)}
          className="w-full h-24 bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-sm focus:border-zinc-700 outline-none resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={isCreating}
        className="w-full h-12 bg-zinc-100 text-black font-bold rounded-xl hover:bg-white transition-all disabled:opacity-50"
      >
        {isCreating ? "Dispatching..." : "Confirm Dispatch"}
      </button>

      {actionError && (
        <p className="text-xs text-red-500 font-medium">{actionError}</p>
      )}
    </form>
  );
}

