"use client";

import { useMemo, useState } from "react";

import OperationsMap from "@/components/operations-map";
import { updateIncidentStatus } from "@/lib/api";
import { titleCase } from "@/lib/normalizers";
import { dashboardStore, useDashboardStore } from "@/store/dashboard-store";
import type { Incident, UserProfile, Vehicle } from "@/types/frontend";

type MapPoint = {
  id: string;
  label: string;
  detail: string;
  latitude: number;
  longitude: number;
  tone: "incident" | "vehicle" | "station";
  vehicle_type?: string;
  station_type?: string;
};

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

export function ResponderOverviewPage() {
  const { state, users, token, loadingAction, locationSharingEnabled } = useDashboardStore();
  const setStore = dashboardStore.setState;
  const profile = state.profile;
  const incidents = useMemo(() => (Array.isArray(state.incidents) ? state.incidents : []), [state.incidents]);
  const vehicles = useMemo(() => (Array.isArray(state.vehicles) ? state.vehicles : []), [state.vehicles]);
  const stations = useMemo(() => (Array.isArray(state.stations) ? state.stations : []), [state.stations]);
  const userList = useMemo(() => (Array.isArray(users) ? users : []), [users]);

  const isAdmin = profile?.role === "system_admin" || (profile?.role || "").includes("admin");
  const [mapFocus, setMapFocus] = useState<{
    latitude: number;
    longitude: number;
    zoom?: number;
  } | null>(null);

  const incidentMatchesVehicle = (incident: Incident, vehicle: Vehicle) => {
    if ((incident.status || "").toLowerCase() === "resolved") return false;
    const assigned = (incident.assigned_unit_id || "").toLowerCase();
    const vehicleID = (vehicle.id || "").toLowerCase();
    const plate = (vehicle.license_plate || "").toLowerCase();
    return Boolean(
      assigned && (assigned === vehicleID || (plate && assigned === plate))
    ) || Boolean(vehicle.incident_id && incident.id === vehicle.incident_id);
  };

  // Determine which drivers/vehicles to show based on the perspective (Individual vs Admin)
  const responders = useMemo(() => {
    const usersByID = new Map(userList.map((u) => [u.id, u]));
    const entries: Array<{ user: UserProfile; vehicle: Vehicle | null; incident: Incident | null }> = [];

    // Primary source: vehicles with assigned drivers.
    for (const vehicle of vehicles) {
      if (!vehicle.driver_id && !vehicle.driver_name) continue;
      const matchedUser = vehicle.driver_id ? usersByID.get(vehicle.driver_id) : undefined;
      const fallbackUser: UserProfile = {
        id: vehicle.driver_id || `vehicle-driver-${vehicle.id}`,
        name: matchedUser?.name || vehicle.driver_name || "Responder",
        email: matchedUser?.email || "",
        role: matchedUser?.role || `${vehicle.vehicle_type || "responder"}_driver`,
        station_id: matchedUser?.station_id,
      };
      const activeIncident = incidents.find((incident) => incidentMatchesVehicle(incident, vehicle)) || null;
      entries.push({
        user: matchedUser || fallbackUser,
        vehicle,
        incident: activeIncident,
      });
    }

    // Secondary source: include known driver users without currently assigned vehicles.
    for (const user of userList) {
      const role = (user.role || "").toLowerCase();
      const isDriver = role.includes("driver");
      if (!isDriver) continue;
      const alreadyIncluded = entries.some((entry) => entry.user.id === user.id);
      if (alreadyIncluded) continue;
      entries.push({ user, vehicle: null, incident: null });
    }

    // Fallback source: ensure active assigned incidents are represented even
    // when driver/user linkage is incomplete.
    for (const incident of incidents) {
      if ((incident.status || "").toLowerCase() === "resolved") continue;
      if (!incident.assigned_unit_id) continue;
      const alreadyIncluded = entries.some((entry) => entry.incident?.id === incident.id);
      if (alreadyIncluded) continue;

      const assigned = incident.assigned_unit_id.toLowerCase();
      const matchedVehicle = vehicles.find((vehicle) => {
        const vehicleID = (vehicle.id || "").toLowerCase();
        const plate = (vehicle.license_plate || "").toLowerCase();
        return assigned === vehicleID || (plate && assigned === plate);
      }) || null;

      entries.push({
        user: {
          id: `incident-${incident.id}`,
          name: matchedVehicle?.driver_name || "Assigned Responder",
          email: "",
          role: matchedVehicle ? `${matchedVehicle.vehicle_type || "responder"}_driver` : (incident.assigned_unit_type || "responder"),
        },
        vehicle: matchedVehicle,
        incident,
      });
    }

    return entries;
  }, [userList, vehicles, incidents]);

  // For the individual responder view (old logic preserved but cleaner)
  const myResponder = useMemo(() => {
    if (!profile) return null;
    const profileName = (profile.name || "").trim().toLowerCase();
    return (
      responders.find((r) => r.user.id === profile.id) ||
      responders.find((r) => (r.vehicle?.driver_id || "") === profile.id) ||
      responders.find((r) => ((r.user.name || "").trim().toLowerCase() === profileName && profileName.length > 0)) ||
      null
    );
  }, [profile, responders]);

  const visibleResponders = useMemo(() => {
    if (isAdmin) return responders;
    return myResponder ? [myResponder] : [];
  }, [isAdmin, responders, myResponder]);

  const driverVehicle = useMemo(() => {
    if (isAdmin) return null;
    if (myResponder?.vehicle) return myResponder.vehicle;
    return null;
  }, [isAdmin, myResponder]);

  const hasActiveDispatch = Boolean(
    myResponder?.incident && (myResponder.incident.status || "").toLowerCase() !== "resolved",
  );
  const canShareLocation = isDriverRole(profile?.role) && !isAdmin;

  const scopedVehicles = useMemo(() => {
    if (isAdmin) return vehicles;
    if (!profile) return vehicles;
    const byResponder = visibleResponders
      .map((r) => r.vehicle)
      .filter((v): v is NonNullable<typeof v> => v !== null);
    if (byResponder.length > 0) return byResponder;

    const profileName = (profile.name || "").trim().toLowerCase();
    const byProfile = vehicles.filter((v) => {
      const idMatch = Boolean(v.driver_id && v.driver_id === profile.id);
      const nameMatch = Boolean(
        v.driver_name && profileName && v.driver_name.trim().toLowerCase() === profileName,
      );
      return idMatch || nameMatch;
    });

    if (byProfile.length > 0) return byProfile;

    return vehicles;
  }, [isAdmin, vehicles, profile, visibleResponders]);

  async function handleIncidentTransition(incidentID: string, nextStatus: string) {
    if (!token) return;
    setStore({ loadingAction: { kind: "incident-status", incidentID, status: nextStatus }, actionError: null, actionNotice: null });
    try {
      const updated = await updateIncidentStatus(token, incidentID, nextStatus);
      setStore((cur) => ({
        state: {
          ...cur.state,
          incidents: cur.state.incidents.map((incident) =>
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

  const mapPoints = useMemo<MapPoint[]>(() => {
    const points: MapPoint[] = [];

    const resolveVehicleCoords = (vehicle: Vehicle): { latitude: number; longitude: number } | null => {
      const latitude = Number((vehicle as unknown as Record<string, unknown>).latitude);
      const longitude = Number((vehicle as unknown as Record<string, unknown>).longitude);
      const hasLiveCoords = Number.isFinite(latitude) && Number.isFinite(longitude) && !(latitude === 0 && longitude === 0);
      if (hasLiveCoords) return { latitude, longitude };

      const station = stations.find((s) => s.id === vehicle.station_id);
      if (station && Number.isFinite(Number(station.latitude)) && Number.isFinite(Number(station.longitude))) {
        return { latitude: Number(station.latitude), longitude: Number(station.longitude) };
      }

      return null;
    };

    // Draw stations first so vehicle markers remain visible on top when overlapping.
    stations.forEach((s) => {
      if (typeof s.latitude !== "number" || typeof s.longitude !== "number") return;
      points.push({
        id: `station-${s.id}`,
        label: s.name || titleCase(s.type || "station"),
        detail: `${titleCase(s.type || "Station")} • ${s.is_available ? "Available" : "Unavailable"}`,
        latitude: s.latitude,
        longitude: s.longitude,
        tone: "station",
        station_type: s.type,
      });
    });

    // Add incidents linked to visible responders
    visibleResponders.forEach((r) => {
      // Add their active incident if it's not already added
      if (r.incident) {
        if (!points.some((p) => p.id === r.incident!.id)) {
          points.push({
            id: r.incident.id,
            label: r.incident.citizen_name,
            detail: titleCase(r.incident.incident_type),
            latitude: r.incident.latitude,
            longitude: r.incident.longitude,
            tone: "incident",
          });
        }
      }
    });

    // Add vehicles last so they render above stations.
    scopedVehicles.forEach((vehicle) => {
      const coords = resolveVehicleCoords(vehicle);
      if (!coords) return;
      points.push({
        id: `vehicle-${vehicle.id}`,
        label: vehicle.license_plate || vehicle.driver_name || titleCase(vehicle.vehicle_type || "vehicle"),
        detail: [titleCase(vehicle.status || "available"), vehicle.driver_name || titleCase(vehicle.vehicle_type || "vehicle")]
          .filter(Boolean)
          .join(" | "),
        latitude: coords.latitude,
        longitude: coords.longitude,
        tone: "vehicle",
        vehicle_type: vehicle.vehicle_type,
      });
    });

    return points;
  }, [visibleResponders, stations, scopedVehicles]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="border-b border-line px-5 py-4">
          <h1 className="text-[14px] font-semibold text-foreground">
            Responder View
          </h1>
          <p className="mt-1 text-[12px] text-muted">
            Responder-linked assignment and live vehicle telemetry from backend.
          </p>
        </div>
        <div className="h-[520px]">
          <OperationsMap className="h-full w-full" points={mapPoints} focusPoint={mapFocus ?? undefined} />
        </div>
      </div>

      <div className="space-y-4">
        {canShareLocation && (
          <div className="rounded-2xl border border-line bg-panel px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Live Location Sharing
            </p>
            <p className="mt-2 text-[12px] text-muted">
              Share your GPS position while responding so dispatch can track your unit on the map.
            </p>
            <div className="mt-3 flex items-center gap-2">
              {!locationSharingEnabled ? (
                <button
                  type="button"
                  onClick={() => setStore({ locationSharingEnabled: true })}
                  disabled={!driverVehicle?.id || !hasActiveDispatch}
                  className="rounded-md border border-line px-3 py-1.5 text-[11px] font-semibold text-foreground transition hover:bg-panel-strong disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Start Sharing
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStore({ locationSharingEnabled: false })}
                  className="rounded-md border border-line px-3 py-1.5 text-[11px] font-semibold text-foreground transition hover:bg-panel-strong"
                >
                  Stop Sharing
                </button>
              )}
              <span className={`text-[11px] font-medium ${locationSharingEnabled ? "text-signal" : "text-muted"}`}>
                {locationSharingEnabled ? "Active" : "Inactive"}
              </span>
            </div>
            {locationSharingEnabled && (
              <p className="mt-2 text-[11px] text-muted">Live location sharing is active.</p>
            )}
            {!hasActiveDispatch && (
              <p className="mt-2 text-[11px] text-muted">
                Sharing becomes available when you have an active dispatched incident.
              </p>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-line bg-panel px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            {isAdmin ? "Active Assignments" : "My Assignment"}
          </p>
          <div className="mt-2 space-y-3">
            {visibleResponders.filter(r => r.incident).length > 0 ? (
              visibleResponders
                .filter(r => r.incident)
                .map(r => {
                  const incident = r.incident!;
                  const currentStatus = (incident.status || "").toLowerCase();
                  const adminActions = isAdminRole(profile?.role) ? getAdminNextStatuses(currentStatus) : [];
                  const isUpdating = loadingAction.kind === "incident-status" && loadingAction.incidentID === incident.id;
                  return (
                    <div
                      key={incident.id}
                      className="w-full border-b border-line pb-3 text-left last:border-0 last:pb-0"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (r.incident) {
                            setMapFocus({
                              latitude: r.incident.latitude,
                              longitude: r.incident.longitude,
                              zoom: 16,
                            });
                          } else if (r.vehicle) {
                            setMapFocus({
                              latitude: r.vehicle.latitude,
                              longitude: r.vehicle.longitude,
                              zoom: 16,
                            });
                          }
                        }}
                        className="w-full text-left transition hover:opacity-90"
                      >
                        <p className="text-[13px] font-semibold text-foreground">
                          {titleCase(incident.incident_type)} — {r.user.name}
                        </p>
                        <p className="mt-1 text-[12px] text-muted">
                          {incident.citizen_name}
                        </p>
                        <p className="mt-2 text-[11px] text-muted">
                          Status: {titleCase(incident.status)} · {r.vehicle?.license_plate || "No Vehicle"}
                        </p>
                      </button>

                      {(isAdminRole(profile?.role) || isDriverRole(profile?.role)) && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {isAdminRole(profile?.role) &&
                            adminActions.map((nextStatus) => (
                              <button
                                key={nextStatus}
                                type="button"
                                disabled={
                                  isUpdating ||
                                  !isTransitionAllowedForRole(profile?.role, currentStatus, nextStatus)
                                }
                                onClick={() => {
                                  void handleIncidentTransition(incident.id, nextStatus);
                                }}
                                className="rounded-md border border-line px-2.5 py-1 text-[10px] font-semibold text-foreground transition hover:bg-panel-strong disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                {isUpdating ? "Updating..." : `Mark ${titleCase(nextStatus)}`}
                              </button>
                            ))}

                          {isDriverRole(profile?.role) && currentStatus === "dispatched" && (
                            <button
                              type="button"
                              disabled={
                                isUpdating ||
                                !isTransitionAllowedForRole(profile?.role, currentStatus, "in_progress")
                              }
                              onClick={() => {
                                if (currentStatus === "dispatched") {
                                  void handleIncidentTransition(incident.id, "in_progress");
                                }
                              }}
                              className="rounded-md border border-line px-2.5 py-1 text-[10px] font-semibold text-foreground transition hover:bg-panel-strong disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              {isUpdating ? "Updating..." : "Mark In Progress"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
            ) : (
              <p className="text-[12px] text-muted">
                No active assignments linked to the current view.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panel px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Responders ({visibleResponders.length})
          </p>
          {visibleResponders.length > 0 ? (
            <div className="mt-3 space-y-2">
              {visibleResponders.map((r) => (
                <button
                  key={r.user.id}
                  type="button"
                  onClick={() => {
                    if (r.vehicle) {
                      setMapFocus({
                        latitude: r.vehicle.latitude,
                        longitude: r.vehicle.longitude,
                        zoom: 16,
                      });
                    } else if (r.incident) {
                      setMapFocus({
                        latitude: r.incident.latitude,
                        longitude: r.incident.longitude,
                        zoom: 16,
                      });
                    }
                  }}
                  className="w-full rounded-lg border border-line bg-background px-3 py-2 text-left transition hover:border-line-strong"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[12px] font-semibold text-foreground">
                        {r.user.name}
                      </p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted font-medium">
                        {titleCase(r.user.role)}
                      </p>
                    </div>
                    {r.vehicle && (
                      <span className="inline-flex items-center rounded-md bg-panel-strong px-2 py-0.5 text-[10px] font-semibold text-muted border border-line">
                        {r.vehicle.license_plate}
                      </span>
                    )}
                  </div>
                  
                  <div className="mt-2 flex items-center justify-between border-t border-line/40 pt-2">
                    <p className="text-[11px] text-muted">
                      {r.vehicle ? titleCase(r.vehicle.status) : "Off-duty / No Vehicle"}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <div className={`h-1.5 w-1.5 rounded-full ${r.incident ? "bg-warning animate-pulse" : "bg-signal"}`} />
                      <span className="text-[10px] font-medium text-muted">
                        {r.incident ? "Assigned" : "Ready"}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[12px] text-muted">
              No responders found in the directory.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
