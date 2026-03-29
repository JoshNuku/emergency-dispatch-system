"use client";

import { Shield } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo } from "react";
import type { ReactNode } from "react";

import MapViewComponent from "@/components/operations-map";
import { DashboardModals } from "@/components/dashboard/dashboard-modals";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  AnalyticsSection,
  DispatchesSection,
  FleetSection,
  TopOverviewSection,
  type LiveResponseCard,
} from "@/components/dashboard/dashboard-sections";
import { dashboardStore, useDashboardStore } from "@/store/dashboard-store";
import type {
  DashboardAppProps,
  Incident,
  Vehicle,
  ModalView,
  RegionIncident,
  ResourceUtilization,
  HospitalCapacity,
} from "@/types/frontend";
import {
  getAnalyticsDashboard,
  getHospitalCapacity,
  getIncidentsByRegion,
  getOpenIncidents,
  getProfile,
  getResourceUtilization,
  getResponseTimes,
  getStations,
  getVehicles,
  login,
  refreshTokens,
} from "@/lib/api";
import {
  ensureArray,
  normalizeDashboardStats,
  normalizeIncident,
  normalizeResponseTimes,
  normalizeStation,
  normalizeVehicle,
} from "@/lib/normalizers";

type StoreUpdate = Parameters<typeof dashboardStore.setState>[0];

type MapPoint = {
  id: string;
  label: string;
  detail: string;
  latitude: number;
  longitude: number;
  tone: "incident" | "vehicle";
};

export function DashboardApp({
  workspace: _workspace,
  section: _section,
}: DashboardAppProps) {
  void _workspace;
  void _section;

  const { state, commandQuery, activeSectionID, isBootstrapping } =
    useDashboardStore();

  const setStore = useCallback(
    (update: StoreUpdate) => dashboardStore.setState(update),
    [],
  );

  const deferredCommandQuery = useDeferredValue(commandQuery || "");
  const query = deferredCommandQuery.toLowerCase();

  const incidentsToShow: Incident[] = state.incidents;
  const safeVehicles: Vehicle[] = state.vehicles;
  const safeResponseTimes = state.responseTimes;

  const ACCESS_TOKEN_KEY = "eds_access_token";
  const REFRESH_TOKEN_KEY = "eds_refresh_token";
  const EXPIRES_AT_KEY = "eds_access_expires_at";

  function storeTokens(
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
  ) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    window.localStorage.setItem(EXPIRES_AT_KEY, `${Date.now() + expiresIn * 1000}`);
  }

  const refreshSession = useCallback(
    async (refreshTokenValue: string) => {
      const refreshed = await refreshTokens(refreshTokenValue);
      storeTokens(
        refreshed.access_token,
        refreshed.refresh_token,
        refreshed.expires_in,
      );
      setStore({ token: refreshed.access_token });
      return refreshed.access_token;
    },
    [setStore],
  );

  const loadDashboard = useCallback(
    async (accessToken: string, allowRefresh = true) => {
      dashboardStore.setState({ dataError: null });
      try {
        const [
          profileResult,
          incidentsResult,
          vehiclesResult,
          stationsResult,
          dashboardResult,
          responseTimesResult,
          regionResult,
          utilizationResult,
          hospitalResult,
        ] = await Promise.allSettled([
          getProfile(accessToken),
          getOpenIncidents(accessToken),
          getVehicles(accessToken),
          getStations(accessToken),
          getAnalyticsDashboard(accessToken),
          getResponseTimes(accessToken),
          getIncidentsByRegion(accessToken),
          getResourceUtilization(accessToken),
          getHospitalCapacity(accessToken),
        ]);

        if (profileResult.status === "rejected") throw profileResult.reason;

        setStore({
          state: {
            profile: profileResult.value,
            incidents:
              incidentsResult.status === "fulfilled"
                ? ensureArray<unknown>(incidentsResult.value)
                    .map(normalizeIncident)
                    .filter((i): i is Incident => i !== null)
                : [],
            vehicles:
              vehiclesResult.status === "fulfilled"
                ? ensureArray<unknown>(vehiclesResult.value)
                    .map(normalizeVehicle)
                    .filter((v): v is Vehicle => v !== null)
                : [],
            stations:
              stationsResult.status === "fulfilled"
                ? ensureArray<unknown>(stationsResult.value)
                    .map(normalizeStation)
                    .filter(
                      (s): s is NonNullable<ReturnType<typeof normalizeStation>> =>
                        s !== null,
                    )
                : [],
            dashboard:
              dashboardResult.status === "fulfilled"
                ? normalizeDashboardStats(dashboardResult.value)
                : null,
            responseTimes:
              responseTimesResult.status === "fulfilled"
                ? normalizeResponseTimes(responseTimesResult.value)
                : [],
            incidentsByRegion:
              regionResult.status === "fulfilled"
                ? ensureArray<RegionIncident>(regionResult.value)
                : [],
            resourceUtilization:
              utilizationResult.status === "fulfilled"
                ? ensureArray<ResourceUtilization>(utilizationResult.value)
                : [],
            hospitalCapacity:
              hospitalResult.status === "fulfilled"
                ? ensureArray<HospitalCapacity>(hospitalResult.value)
                : [],
          },
        });

        return profileResult.value;
      } catch (error) {
        if (allowRefresh) {
          const rt = window.localStorage.getItem(REFRESH_TOKEN_KEY);
          if (rt) {
            try {
              const newToken = await refreshSession(rt);
              if (newToken !== accessToken) {
                await loadDashboard(newToken, false);
                return;
              }
            } catch {
              /* fall through */
            }
          }
        }

        const message =
          error instanceof Error ? error.message : "Unable to load dashboard";

    setStore({
          dataError: message,
          state: dashboardStore.emptyLiveState,
          token: null,
        });
        window.localStorage.removeItem(ACCESS_TOKEN_KEY);
        window.localStorage.removeItem(REFRESH_TOKEN_KEY);
        window.localStorage.removeItem(EXPIRES_AT_KEY);
        return null;
      } finally {
        setStore({ isBootstrapping: false });
      }
    },
    [refreshSession, setStore],
  );

  const handleLogin = useCallback(
    async (email: string, password: string) => {
      setStore({ authError: null, loadingAction: { kind: "login" } });
      try {
        const tokens = await login(email, password);
        storeTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in);
        setStore({ token: tokens.access_token });
        const profile = await loadDashboard(tokens.access_token, false);
        if (!profile) return;
      setStore({
          openModal: null,
          selectedIncidentID: null,
          authError: null,
        loadingAction: { kind: "idle" },
      });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Sign-in failed";
        setStore({ authError: message, loadingAction: { kind: "idle" } });
      }
    },
    [loadDashboard, setStore],
  );

  // ── Bootstrap tokens on first load ─────────────────────────────────────
  useEffect(() => {
    const storedToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!storedToken) {
      setStore({ isBootstrapping: false });
      return;
    }
    setStore({ token: storedToken });
    void loadDashboard(storedToken);
  }, [loadDashboard, setStore]);

  const liveResponseCards = useMemo<LiveResponseCard[]>(() => {
    if (safeResponseTimes.length === 0) {
      return [
        {
          label: "Pending Analytics",
          value: "---",
          detail: "Waiting for dispatch data...",
          tone: "signal",
        },
      ];
    }

    return safeResponseTimes.slice(0, 3).map((item, index) => ({
      label: item.incident_type || "Type",
      value: `${item.avg_seconds}s`,
      detail: `Fastest ${item.min_seconds}s across ${item.count} units.`,
      tone: (["signal", "warning", "danger"] as const)[index] ?? "signal",
    }));
  }, [safeResponseTimes]);

  const filteredIncidents = useMemo(() => {
    if (!query) return incidentsToShow;
    return incidentsToShow.filter((i) => {
      return (
        i.citizen_name.toLowerCase().includes(query) ||
        i.incident_type.toLowerCase().includes(query)
      );
    });
  }, [incidentsToShow, query]);

  const filteredVehicles = useMemo(() => {
    if (!query) return safeVehicles;
    return safeVehicles.filter((v) => {
      return (
        (v.license_plate || "").toLowerCase().includes(query) ||
        v.vehicle_type.toLowerCase().includes(query)
      );
    });
  }, [safeVehicles, query]);

  const mapPoints = useMemo<MapPoint[]>(() => {
    const p: MapPoint[] = incidentsToShow.map((i) => ({
      id: i.id,
      label: i.citizen_name || "Emergency",
      detail: i.incident_type,
      latitude: i.latitude,
      longitude: i.longitude,
      tone: "incident",
    }));

    const v: MapPoint[] = safeVehicles.map((veh) => ({
      id: veh.id,
      label: veh.license_plate || "Unassigned Unit",
      detail: veh.status,
      latitude: veh.latitude,
      longitude: veh.longitude,
      tone: "vehicle",
    }));

    return [...p, ...v];
  }, [incidentsToShow, safeVehicles]);

  const onOpenIncidentDetails = (incidentId: string) => {
    setStore({ openModal: "incident-details", selectedIncidentID: incidentId });
  };

  const onOpenVehicleCommand = (vehicleId: string) => {
    setStore({ openModal: "vehicle-command", selectedVehicleID: vehicleId });
  };

  const content: ReactNode = (() => {
    switch (activeSectionID) {
      case "top":
        return (
          <TopOverviewSection
            liveResponseCards={liveResponseCards}
            mapPoints={mapPoints}
            incidentsToShow={incidentsToShow}
            onOpenIncidentDetails={onOpenIncidentDetails}
            MapViewComponent={MapViewComponent}
          />
        );
      case "dispatches":
        return (
          <DispatchesSection
            filteredIncidents={filteredIncidents}
            onOpenIncidentDetails={onOpenIncidentDetails}
          />
        );
      case "fleet":
        return (
          <FleetSection
            filteredVehicles={filteredVehicles}
            onOpenVehicleCommand={onOpenVehicleCommand}
          />
        );
      case "analytics":
        return <AnalyticsSection />;
      default:
        return null;
    }
  })();

  return (
    <div className="h-screen w-full bg-[#0a0a0a] text-zinc-100 overflow-hidden font-sans selection:bg-blue-500/20">
      {isBootstrapping ? (
        <div className="flex h-full w-full items-center justify-center p-8">
          <div className="w-16 h-16 rounded-3xl bg-blue-600 flex items-center justify-center animate-pulse shadow-2xl">
            <Shield className="w-8 h-8 text-white" />
          </div>
        </div>
      ) : !state.profile ? (
        <div className="flex h-full w-full items-center justify-center p-8">
          <div className="w-full max-w-sm space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <div className="flex flex-col items-center gap-6">
              <div className="w-16 h-16 rounded-3xl bg-blue-600 flex items-center justify-center shadow-2xl">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <div className="text-center">
                <h1 className="text-2xl font-bold tracking-tight">
                  Emergency Dispatch
                </h1>
                <p className="text-sm text-zinc-500 mt-2">
                  Access command and control system.
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <button
                onClick={() => setStore({ openModal: "login" as ModalView })}
                className="w-full h-12 rounded-xl bg-zinc-100 text-black font-bold hover:bg-white shadow-xl transition-all"
              >
                Authenticate Personnel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <DashboardShell
          profileName={state.profile.name}
          activeSectionID={activeSectionID}
          onSelectSection={(id) => setStore({ activeSectionID: id })}
          onOpenIncidentIntake={() => setStore({ openModal: "incident-intake" })}
        >
          {content}
        </DashboardShell>
      )}

      <DashboardModals onLogin={handleLogin} />
    </div>
  );
}

