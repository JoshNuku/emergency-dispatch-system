"use client";

import { useState } from "react";

import { deleteStation, updateStation } from "@/lib/api";
import ConfirmModal from "@/components/v2/ui/confirm-modal";
import { dashboardStore, useDashboardStore } from "@/store/dashboard-store";
import { titleCase } from "@/lib/normalizers";

function AvailabilityDot({ available }: { available: boolean }) {
  return (
    <span
      className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${available ? "bg-foreground/70" : "bg-muted"
        }`}
    />
  );
}

export function StationsPage() {
  const { state, token } = useDashboardStore();
  const setStore = dashboardStore.setState;
  const [editingID, setEditingID] = useState("");
  const [pendingID, setPendingID] = useState("");

  const stations = state.stations ?? [];

  function updateField(stationID: string, field: string, value: unknown) {
    setStore((c) => ({
      state: {
        ...c.state,
        stations: c.state.stations.map((s) =>
          s.id === stationID ? { ...s, [field]: value } : s,
        ),
      },
    }));
  }

  async function saveStation(stationID: string) {
    if (!token) return;
    const station = stations.find((s) => s.id === stationID);
    if (!station) return;
    setPendingID(stationID);
    try {
      const updated = await updateStation(token, stationID, {
        name: station.name,
        is_available: station.is_available,
        total_capacity: station.total_capacity,
        available_capacity: station.available_capacity,
        contact_phone: station.contact_phone,
      });
      setStore((c) => ({
        state: {
          ...c.state,
          stations: c.state.stations.map((s) =>
            s.id === stationID ? { ...s, ...updated } : s,
          ),
        },
        actionNotice: "Station updated.",
      }));
      setEditingID("");
    } catch (error) {
      setStore({
        actionError:
          error instanceof Error ? error.message : "Failed to update station",
      });
    } finally {
      setPendingID("");
    }
  }

  async function confirmRemoveStation() {
    if (!token || !pendingID) return;
    setPendingID(pendingID);
    try {
      await deleteStation(token, pendingID);
      setStore((c) => ({
        state: {
          ...c.state,
          stations: c.state.stations.filter((s) => s.id !== pendingID),
        },
        actionNotice: "Station deleted.",
      }));
      if (editingID === pendingID) setEditingID("");
    } catch (error) {
      setStore({ actionError: error instanceof Error ? error.message : "Failed to delete station" });
    } finally {
      setPendingID("");
    }
  }

  function cancelRemoveStation() {
    setPendingID("");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-panel px-6 py-5">
        <h1 className="text-[14px] font-semibold text-foreground">Stations</h1>
        <p className="mt-1 text-[12px] text-muted">
          Review station availability and capacity reporting.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <p className="text-[13px] font-semibold text-foreground">
            Stations ({stations.length})
          </p>
          <button
            type="button"
            onClick={() => setStore({ openModal: "station-manage" })}
            className="rounded-lg border border-line bg-background px-3 py-2 text-[12px] font-medium text-muted transition hover:border-line-strong hover:text-foreground"
          >
            Manage stations
          </button>
        </div>

        {stations.length === 0 ? (
          <div className="px-6 py-6 text-[12px] text-muted">
            No station data loaded yet.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {stations.slice(0, 100).map((s) => (
              <div key={s.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <AvailabilityDot available={s.is_available} />
                      <p className="truncate text-[13px] font-semibold text-foreground">
                        {s.name}
                      </p>
                      <span className="rounded-md border border-line bg-background px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                        {titleCase(s.type)}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-muted">
                      {s.latitude.toFixed(3)}, {s.longitude.toFixed(3)}
                    </p>
                    {typeof s.total_capacity === "number" ? (
                      <p className="mt-2 text-[11px] text-muted">
                        Capacity: {s.available_capacity ?? 0}/{s.total_capacity}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-md border border-line bg-panel-strong px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted"
                    >
                      {s.is_available ? "Available" : "Limited"}
                    </span>
                    {editingID === s.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void saveStation(s.id)}
                          disabled={pendingID === s.id}
                          className="rounded-md border border-line bg-panel-strong px-2.5 py-1 text-[11px] font-medium text-foreground disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingID("")}
                          disabled={pendingID === s.id}
                          className="rounded-md border border-line bg-background px-2.5 py-1 text-[11px] font-medium text-muted"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingID(s.id)}
                          className="rounded-md border border-line bg-background px-2.5 py-1 text-[11px] font-medium text-muted"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingID(s.id)}
                          disabled={pendingID === s.id}
                          className="rounded-md border border-danger/20 bg-danger/10 px-2.5 py-1 text-[11px] font-medium text-danger disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {pendingID === s.id && (
                  <ConfirmModal
                    open={true}
                    title="Delete station"
                    description="Delete this station? This cannot be undone."
                    confirmLabel="Delete"
                    cancelLabel="Cancel"
                    loading={false}
                    onConfirm={() => void confirmRemoveStation()}
                    onCancel={() => cancelRemoveStation()}
                  />
                )}
                {editingID === s.id && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input
                      value={s.name}
                      onChange={(e) => updateField(s.id, "name", e.target.value)}
                      className="rounded-lg border border-line bg-background px-3 py-2 text-[12px] text-foreground"
                    />
                    <input
                      type="number"
                      value={s.contact_phone ?? ""}
                      onChange={(e) =>
                        updateField(s.id, "contact_phone", e.target.value)
                      }
                      placeholder="Phone"
                      className="rounded-lg border border-line bg-background px-3 py-2 text-[12px] text-foreground"
                    />
                    <input
                      type="number"
                      value={s.total_capacity ?? 0}
                      onChange={(e) =>
                        updateField(s.id, "total_capacity", Number(e.target.value))
                      }
                      className="rounded-lg border border-line bg-background px-3 py-2 text-[12px] text-foreground"
                    />
                    <input
                      type="number"
                      value={s.available_capacity ?? 0}
                      onChange={(e) =>
                        updateField(
                          s.id,
                          "available_capacity",
                          Number(e.target.value),
                        )
                      }
                      className="rounded-lg border border-line bg-background px-3 py-2 text-[12px] text-foreground"
                    />
                    <label className="sm:col-span-2 flex items-center gap-2 text-[12px] text-muted">
                      <input
                        type="checkbox"
                        checked={s.is_available}
                        onChange={(e) =>
                          updateField(s.id, "is_available", e.target.checked)
                        }
                      />
                      Station available
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

