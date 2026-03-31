/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type FormEvent,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Bell, PanelLeftClose, PanelLeftOpen, RefreshCw } from "lucide-react";

import {
  LayoutDashboardIcon,
  TruckIcon,
  BarChart2Icon,
  ShieldIcon,
  SunIcon,
  MoonIcon,
  LogOutIcon,
  UsersIcon,
  PlusIcon,
  XIcon,
  BuildingIcon,
  CarIcon,
  MapPinIcon,
  XCircleIcon,
  PencilIcon,
} from "@/components/v2/icons";
import { LocationPicker } from "@/components/location-picker";
import { useRealtimeEvents } from "@/hooks/use-realtime-events";
import { Button } from "@/components/v2/ui/button";
import Portal from "@/components/v2/ui/portal";
import { Card, CardBody, CardHeader } from "@/components/v2/ui/card";
import { Input } from "@/components/v2/ui/input";
import { Modal } from "@/components/v2/ui/modal";
import ConfirmModal from "@/components/v2/ui/confirm-modal";
import {
  createIncident,
  getAnalyticsDashboard,
  getHospitalCapacity,
  getIncidents,
  getIncidentsByRegion,
  getProfile,
  getResourceUtilization,
  getResponseTimes,
  getStations,
  getUsers,
  getVehicles,
  login,
  refreshTokens,
  registerUser,
  updateMyProfile,
  updateUser,
  deleteUser,
  updateIncidentStatus,
  updateStation,
  createStation,
  deleteStation,
  updateVehicleLocation,
  updateVehicleStatus,
} from "@/lib/api";
import {
  ensureArray,
  extractEnvelopeData,
  mergeIncidentRecord,
  normalizeDashboardStats,
  normalizeIncident,
  normalizeResponseTimes,
  normalizeStation,
  normalizeVehicle,
  titleCase,
} from "@/lib/normalizers";
import { dashboardStore, useDashboardStore } from "@/store/dashboard-store";
import {
  type HospitalCapacity,
  type Incident,
  type RegionIncident,
  type ResourceUtilization,
  type Station,
  type Vehicle,
  type WorkspaceView,
} from "@/types/frontend";

// ── Token storage keys ───────────────────────────────────────────────────────
const ACCESS_TOKEN_KEY = "eds_access_token";
const REFRESH_TOKEN_KEY = "eds_refresh_token";
const EXPIRES_AT_KEY = "eds_expires_at";

// ── Workspace route helpers ──────────────────────────────────────────────────
function workspacePath(w: WorkspaceView): string {
  if (w === "admin") return "/admin";
  if (w === "responder" || w === "driver") return "/responder";
  if (w === "operations") return "/operations";
  return "/";
}

function defaultWorkspace(role: string): WorkspaceView {
  if (role === "system_admin") return "admin";
  if (
    role === "ambulance_driver" ||
    role === "police_driver" ||
    role === "fire_driver" ||
    role === "driver"
  )
    return "responder";
  return "operations";
}

function isResponderRole(role: string | undefined): boolean {
  if (!role) return false;
  return (
    role === "ambulance_driver" ||
    role === "police_driver" ||
    role === "fire_driver" ||
    role === "driver"
  );
}

function allowedWorkspaces(role: string | undefined): WorkspaceView[] {
  if (!role) return [];
  if (role === "system_admin") return ["admin", "operations", "responder"];
  const isDeptAdmin = role === "hospital_admin" || role === "police_admin" || role === "fire_admin";
  if (isDeptAdmin) return ["operations", "responder"];
  if (isResponderRole(role)) return ["operations", "responder"];
  return ["operations"];
}

// Map a user role to the station type they should be associated with (if any)
function roleToStationType(role?: string): string | null {
  if (!role) return null;
  switch (role) {
  case "ambulance_driver":
  case "hospital_admin":
    return "hospital";
  case "police_driver":
  case "police_admin":
    return "police";
  case "fire_driver":
  case "fire_admin":
    return "fire";
  default:
    return null;
  }
}

function formatNotificationDetail(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "Backend event received.";
  const record = payload as Record<string, unknown>;
  const summaryKeys = [
    "message",
    "status",
    "incident_id",
    "vehicle_id",
    "station_id",
    "user_id",
  ];
  const details = summaryKeys
    .filter((key) => typeof record[key] === "string" || typeof record[key] === "number")
    .map((key) => `${key.replaceAll("_", " ")}: ${String(record[key])}`);
  if (details.length > 0) return details.join(" | ");
  return "Backend event received.";
}

// Map an event type to a severity level used for notifications
function eventSeverity(type: string, payload?: unknown): "low" | "info" | "warning" | "critical" {
  try {
    const data = (extractEnvelopeData(payload) ?? payload) as Record<string, unknown> | null;
    if (type.startsWith("incident.")) {
      if (type === "incident.created") return "info";
      if (type === "incident.dispatched") return "info";
      if (type === "incident.status_changed") {
        const st = data && typeof data.status === "string" ? String(data.status).toLowerCase() : null;
        if (st === "resolved") return "low";
        return "warning";
      }
      return "info";
    }
    if (type.startsWith("vehicle.")) {
      if (type === "vehicle.location_updated") return "low";
      if (type === "vehicle.status_changed") {
        const st = data && typeof data.status === "string" ? String(data.status).toLowerCase() : null;
        if (st === "disabled" || st === "broken" || st === "out_of_service") return "warning";
        return "info";
      }
    }
    return "info";
  } catch {
    return "info";
  }
}

function maybeNotifyDesktop(title: string, body: string, severity: string) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  try {
    const shouldAlwaysNotify = severity === "warning" || severity === "critical";
    const notVisible = document.visibilityState !== "visible";
    if (!shouldAlwaysNotify && !notVisible) return;

    if (Notification.permission === "granted") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const n = new Notification(title, { body });
      } catch {
        /* ignore */
      }
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const n = new Notification(title, { body });
          } catch {
            /* ignore */
          }
        }
      });
    }
  } catch {
    /* ignore */
  }
}

// ── Sidebar nav definition ───────────────────────────────────────────────────
type NavEntry = {
  href: string;
  label: string;
  icon: ReactNode;
  adminOnly?: boolean;
};

type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  time: string;
  severity: "low" | "info" | "warning" | "critical";
  timestamp: number;
};

const NAV_ENTRIES: NavEntry[] = [
  {
    href: "/operations",
    label: "Overview",
    icon: <LayoutDashboardIcon className="h-4.5 w-4.5" />,
  },
  {
    href: "/operations/fleet",
    label: "Fleet",
    icon: <TruckIcon className="h-4.5 w-4.5" />,
  },
  {
    href: "/operations/analytics",
    label: "Analytics",
    icon: <BarChart2Icon className="h-4.5 w-4.5" />,
  },
  {
    href: "/responder",
    label: "Responder",
    icon: <CarIcon className="h-4.5 w-4.5" />,
  },
  {
    href: "/admin",
    label: "Admin",
    icon: <ShieldIcon className="h-4.5 w-4.5" />,
    adminOnly: true,
  },
  {
    href: "/admin/stations",
    label: "Stations",
    icon: <BuildingIcon className="h-4.5 w-4.5" />,
    adminOnly: true,
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: <UsersIcon className="h-4.5 w-4.5" />,
    adminOnly: true,
  },
];

// Toggle / Switch component
function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex h-9 items-center justify-between gap-3 rounded-lg border border-line bg-panel-strong pl-3 pr-2.5 transition active:scale-[0.98] ${disabled ? "opacity-50" : "cursor-pointer hover:border-line-strong"}`}>
      {label && <span className="text-[11px] font-semibold text-muted/80">{label}</span>}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${
          checked ? "bg-signal" : "bg-panel"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}

// ── AppShell props ───────────────────────────────────────────────────────────
export type AppShellProps = {
  workspace?: WorkspaceView;
  children?: ReactNode;
};

// ── Main component ───────────────────────────────────────────────────────────
export function AppShell({
  workspace = "operations",
  children,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const {
    email,
    password,
    token,
    state,
    authError,
    actionError,
    actionNotice,
    loadingAction,
    isBootstrapping,
    theme,
    incidentForm,
    selectedVehicleID,
    vehicleStatus,
    vehicleLatitude,
    vehicleLongitude,
    users,
    registerForm,
    editingUserID,
    editingStationID,
    openModal,
    isPickingLocation,
    lastMapSelectedCoords,
    locationSharingEnabled,
  } = useDashboardStore();

  const setStore = dashboardStore.setState;
  const [newStationForm, setNewStationForm] = useState<Partial<Station>>({
    name: "",
    type: "police",
    latitude: 5.6512,
    longitude: -0.1869,
    is_available: true,
    total_capacity: 0,
    available_capacity: 0,
    contact_phone: "",
  });
  const [myProfileName, setMyProfileName] = useState("");
  const [myProfilePassword, setMyProfilePassword] = useState("");
  const [myProfilePasswordConfirm, setMyProfilePasswordConfirm] = useState("");

  // Station field update callback
  const updateStationField = useCallback((
    stationID: string,
    field: string,
    value: unknown,
  ) => {
    setStore((c) => ({
      state: {
        ...c.state,
        stations: c.state.stations.map((s) =>
          s.id === stationID ? { ...s, [field]: value } : s,
        ),
      },
    }));
  }, [setStore]);

  // Effect to grab map coordinates when picking
  useEffect(() => {
    if (isPickingLocation && lastMapSelectedCoords) {
      if (editingStationID) {
        updateStationField(
          editingStationID,
          "latitude",
          lastMapSelectedCoords.lat,
        );
        updateStationField(
          editingStationID,
          "longitude",
          lastMapSelectedCoords.lng,
        );
      } else {
        setNewStationForm((prev) => ({
          ...prev,
          latitude: lastMapSelectedCoords.lat,
          longitude: lastMapSelectedCoords.lng,
        }));
      }
      setStore({ isPickingLocation: false, lastMapSelectedCoords: null });
    }
  }, [
    isPickingLocation,
    lastMapSelectedCoords,
    editingStationID,
    updateStationField,
    setStore,
  ]);

  const { events: realtimeEvents, status: realtimeStatus } =
    useRealtimeEvents(token);
  const safeIncidents = useMemo(
    () => ensureArray<Incident>(state.incidents),
    [state.incidents],
  );
  const safeVehicles = useMemo(
    () => ensureArray<Vehicle>(state.vehicles),
    [state.vehicles],
  );
  const safeStations = useMemo(() => ensureArray<Station>(state.stations), [state.stations]);
  const safeRealtimeEvents = useMemo(
    () => ensureArray<(typeof realtimeEvents)[number]>(realtimeEvents),
    [realtimeEvents],
  );
  const latestRealtimeEvent = safeRealtimeEvents[0] ?? null;

  const signedIn = Boolean(token && state.profile);
  const isSystemAdmin = state.profile?.role === "system_admin";
  const isResponder = isResponderRole(state.profile?.role);
  const isDepartmentAdmin =
    state.profile?.role === "hospital_admin" ||
    state.profile?.role === "police_admin" ||
    state.profile?.role === "fire_admin";
  const isDriverUser = isResponder && !isDepartmentAdmin && !isSystemAdmin;
  const canManageIncidents = state.profile?.role === "system_admin";
  const canControlVehicles = isSystemAdmin || isDepartmentAdmin || isDriverUser;
  const profileInitial = (state.profile?.name ?? "U")[0].toUpperCase();

  const filteredVehicles = useMemo(() => {
    if (!isDriverUser || !state.profile) return safeVehicles;
    const profileID = state.profile.id;
    const profileName = (state.profile.name ?? "").trim().toLowerCase();
    return safeVehicles.filter((vehicle) => {
      const idMatch = Boolean(vehicle.driver_id && vehicle.driver_id === profileID);
      const nameMatch = Boolean(
        vehicle.driver_name &&
          profileName &&
          vehicle.driver_name.trim().toLowerCase() === profileName,
      );
      return idMatch || nameMatch;
    });
  }, [isDriverUser, safeVehicles, state.profile]);
  const selectedVehicle = useMemo(
    () =>
      filteredVehicles.find((v) => v.id === selectedVehicleID) ??
      filteredVehicles[0] ??
      null,
    [filteredVehicles, selectedVehicleID],
  );

  const isLoggingIn = loadingAction.kind === "login";
  const isCreatingIncident = loadingAction.kind === "create-incident";
  const isUpdatingVehicleStatus =
    loadingAction.kind === "vehicle-status" &&
    loadingAction.vehicleID === selectedVehicleID;
  const isUpdatingVehicleLocation =
    loadingAction.kind === "vehicle-location" &&
    loadingAction.vehicleID === selectedVehicleID;
  const locationShareWatcherRef = useRef<number | null>(null);
  const locationShareLastSentRef = useRef(0);

  const driverAssignedVehicle = useMemo(() => {
    if (!isDriverUser || !state.profile) return null;
    const profileID = state.profile.id;
    const profileName = (state.profile.name ?? "").trim().toLowerCase();
    return (
      safeVehicles.find((vehicle) => {
        const idMatch = Boolean(vehicle.driver_id && vehicle.driver_id === profileID);
        const nameMatch = Boolean(
          vehicle.driver_name &&
            profileName &&
            vehicle.driver_name.trim().toLowerCase() === profileName,
        );
        return idMatch || nameMatch;
      }) ?? null
    );
  }, [isDriverUser, safeVehicles, state.profile]);

  const driverHasActiveDispatch = useMemo(() => {
    if (!driverAssignedVehicle) return false;
    const assignedVehicleID = (driverAssignedVehicle.id || "").toLowerCase();
    const assignedPlate = (driverAssignedVehicle.license_plate || "").toLowerCase();
    return safeIncidents.some((incident) => {
      const status = (incident.status || "").toLowerCase();
      if (status === "resolved") return false;
      const assignedUnitID = (incident.assigned_unit_id || "").toLowerCase();
      return (
        (assignedUnitID && (assignedUnitID === assignedVehicleID || assignedUnitID === assignedPlate)) ||
        Boolean(driverAssignedVehicle.incident_id && incident.id === driverAssignedVehicle.incident_id)
      );
    });
  }, [driverAssignedVehicle, safeIncidents]);

  const visibleNavEntries = useMemo(
    () =>
      NAV_ENTRIES.filter((e) => {
        if (e.adminOnly && !isSystemAdmin) return false;
        if (isResponder) {
          return e.href === "/operations" || e.href === "/responder";
        }
        return true;
      }),
    [isSystemAdmin, isResponder],
  );

  const workspaceTitle =
    workspace === "admin"
      ? "System Console"
      : (workspace === "responder" || workspace === "driver")
        ? "Responder View"
        : "Operations Center";

  // ── Token helpers ──────────────────────────────────────────────────────────
  function storeTokens(
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
  ) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    window.localStorage.setItem(
      EXPIRES_AT_KEY,
      `${Date.now() + expiresIn * 1000}`,
    );
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

  // ── Load dashboard ─────────────────────────────────────────────────────────
  const loadDashboard = useCallback(
    async (accessToken: string, allowRefresh = true) => {
      setStore({ dataError: null });
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
          usersResult,
        ] = await Promise.allSettled([
          getProfile(accessToken),
          getIncidents(accessToken),
          getVehicles(accessToken),
          getStations(accessToken),
          getAnalyticsDashboard(accessToken),
          getResponseTimes(accessToken),
          getIncidentsByRegion(accessToken),
          getResourceUtilization(accessToken),
          getHospitalCapacity(accessToken),
          getUsers(accessToken),
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
                      (
                        s,
                      ): s is NonNullable<
                        ReturnType<typeof normalizeStation>
                      > => s !== null,
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
          // populate top-level users so pages that need drivers don't require
          // the Users modal to be opened first
          users:
            usersResult && usersResult.status === "fulfilled"
              ? ensureArray(usersResult.value)
              : [],
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

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const storedToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!storedToken) {
      setStore({ isBootstrapping: false });
      return;
    }
    setStore({ token: storedToken });
    void loadDashboard(storedToken);
  }, [loadDashboard, setStore]);

  // ── Theme sync ────────────────────────────────────────────────────────────
  useEffect(() => {
    const storedTheme = window.localStorage.getItem("eds_theme");
    if (storedTheme === "light" || storedTheme === "dark")
      setStore({ theme: storedTheme });
  }, [setStore]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("eds_theme", theme);
  }, [theme]);

  // ── Workspace redirect ────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.profile) return;
    const allowed = allowedWorkspaces(state.profile.role);
    if (workspace === "home" || !allowed.includes(workspace)) {
      const nextPath = workspacePath(defaultWorkspace(state.profile.role));
      if (pathname !== nextPath) router.replace(nextPath);
    }
  }, [pathname, router, state.profile, workspace]);

  // ── Auto-select first vehicle ─────────────────────────────────────────────
  useEffect(() => {
    if (filteredVehicles.length === 0) {
      setStore({ selectedVehicleID: "" });
      return;
    }
    setStore((cur) => ({
      selectedVehicleID:
        cur.selectedVehicleID &&
        filteredVehicles.some((v) => v.id === cur.selectedVehicleID)
          ? cur.selectedVehicleID
          : filteredVehicles[0].id,
    }));
  }, [filteredVehicles, setStore]);

  useEffect(() => {
    const v =
      safeVehicles.find((v) => v.id === selectedVehicleID) ?? safeVehicles[0];
    if (!v) return;
    setStore({
      vehicleStatus: v.status,
      vehicleLatitude: v.latitude.toFixed(4),
      vehicleLongitude: v.longitude.toFixed(4),
    });
  }, [safeVehicles, selectedVehicleID, setStore]);

  // Sign out handler
  const handleSignOut = useCallback(() => {
    dashboardStore.reset();
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    window.localStorage.removeItem(EXPIRES_AT_KEY);
    router.replace("/");
  }, [router]);


  // ── Token refresh interval ────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const interval = window.setInterval(() => {
      const rt = window.localStorage.getItem(REFRESH_TOKEN_KEY);
      const expiresAt = Number(
        window.localStorage.getItem(EXPIRES_AT_KEY) ?? "0",
      );
      if (!rt || !expiresAt || Date.now() < expiresAt - 60_000) return;
      void (async () => {
        try {
          const newToken = await refreshSession(rt);
          await loadDashboard(newToken, false);
        } catch {
          handleSignOut();
        }
      })();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [token, loadDashboard, refreshSession, handleSignOut]);

  // ── Realtime event handler ────────────────────────────────────────────────
  useEffect(() => {
    if (!latestRealtimeEvent) return;
    const payload = extractEnvelopeData(latestRealtimeEvent.payload);
    if (!payload) return;

    setStore((cur) => {
      switch (latestRealtimeEvent.type) {
        case "incident.created":
          return {
            state: {
              ...cur.state,
              incidents: mergeIncidentRecord(
                cur.state.incidents,
                payload as unknown as Incident,
              ),
            },
          };
        case "incident.dispatched":
        case "incident.status_changed": {
          const inc =
            typeof payload.incident === "object" && payload.incident !== null
              ? (payload.incident as Incident)
              : null;
          if (!inc) return cur;
          return {
            state: {
              ...cur.state,
              incidents: mergeIncidentRecord(cur.state.incidents, inc),
            },
          };
        }
        case "vehicle.location_updated": {
          const vid =
            typeof payload.vehicle_id === "string" ? payload.vehicle_id : "";
          if (!vid) return cur;
          const existing = cur.state.vehicles.find((v) => v.id === vid);
          const updated: Vehicle = existing
            ? {
                ...existing,
                latitude:
                  typeof payload.latitude === "number"
                    ? payload.latitude
                    : existing.latitude,
                longitude:
                  typeof payload.longitude === "number"
                    ? payload.longitude
                    : existing.longitude,
                status:
                  typeof payload.status === "string"
                    ? payload.status
                    : existing.status,
              }
            : {
                id: vid,
                station_id: "",
                station_type: "unknown",
                vehicle_type: "unknown",
                status:
                  typeof payload.status === "string"
                    ? payload.status
                    : "available",
                latitude:
                  typeof payload.latitude === "number" ? payload.latitude : 0,
                longitude:
                  typeof payload.longitude === "number" ? payload.longitude : 0,
              };
          return {
            state: {
              ...cur.state,
              vehicles: [
                updated,
                ...cur.state.vehicles.filter((v) => v.id !== vid),
              ],
            },
          };
        }
        case "vehicle.status_changed": {
          const vid =
            typeof payload.vehicle_id === "string" ? payload.vehicle_id : "";
          if (!vid) return cur;
          return {
            state: {
              ...cur.state,
              vehicles: cur.state.vehicles.map((v) =>
                v.id === vid && typeof payload.status === "string"
                  ? { ...v, status: payload.status }
                  : v,
              ),
            },
          };
        }
        default:
          return cur;
      }
    });
  }, [latestRealtimeEvent, setStore]);

  // ── Driver live location sharing (persists across page navigation) ───────
  useEffect(() => {
    const clearWatcher = () => {
      if (locationShareWatcherRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(locationShareWatcherRef.current);
      }
      locationShareWatcherRef.current = null;
    };

    const canRun =
      Boolean(token) &&
      locationSharingEnabled &&
      isDriverUser &&
      Boolean(driverAssignedVehicle?.id) &&
      driverHasActiveDispatch;

    if (!canRun) {
      clearWatcher();
      if (locationSharingEnabled && (!isDriverUser || !driverAssignedVehicle?.id || !driverHasActiveDispatch)) {
        setStore({ locationSharingEnabled: false });
      }
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      clearWatcher();
      setStore({
        locationSharingEnabled: false,
        actionError: "Geolocation is not supported in this browser.",
      });
      return;
    }

    if (locationShareWatcherRef.current !== null) return;

    locationShareWatcherRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - locationShareLastSentRef.current < 5000) return;
        locationShareLastSentRef.current = now;
        void (async () => {
          try {
            await updateVehicleLocation(
              token!,
              driverAssignedVehicle!.id,
              position.coords.latitude,
              position.coords.longitude,
            );
            setStore((cur) => ({
              state: {
                ...cur.state,
                vehicles: cur.state.vehicles.map((vehicle) =>
                  vehicle.id === driverAssignedVehicle!.id
                    ? {
                        ...vehicle,
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                      }
                    : vehicle,
                ),
              },
            }));
          } catch (error) {
            clearWatcher();
            setStore({
              locationSharingEnabled: false,
              actionError:
                error instanceof Error
                  ? error.message
                  : "Failed to publish live location.",
            });
          }
        })();
      },
      (error) => {
        clearWatcher();
        setStore({
          locationSharingEnabled: false,
          actionError: error.message || "Unable to access your location.",
        });
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      },
    );

    return clearWatcher;
  }, [
    driverAssignedVehicle,
    driverHasActiveDispatch,
    isDriverUser,
    locationSharingEnabled,
    setStore,
    token,
  ]);

  // ── Auth actions ──────────────────────────────────────────────────────────
  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStore({ authError: null, loadingAction: { kind: "login" } });
    startTransition(() => {
      void (async () => {
        try {
          const tokens = await login(email, password);
          storeTokens(
            tokens.access_token,
            tokens.refresh_token,
            tokens.expires_in,
          );
          setStore({ token: tokens.access_token });
          const profile = await loadDashboard(tokens.access_token, false);
          if (!profile) return;
          setStore({ loadingAction: { kind: "idle" } });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Sign-in failed";
          setStore({ authError: message, loadingAction: { kind: "idle" } });
        }
      })();
    });
  }
  // ── Incident actions ──────────────────────────────────────────────────────
  function handleIncidentFieldChange(field: string, value: unknown) {
    setStore((c) => ({ incidentForm: { ...c.incidentForm, [field]: value } }));
  }

  async function handleCreateIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.profile?.role !== "system_admin") {
      setStore({
        actionError: "Only system admins can dispatch incidents.",
        loadingAction: { kind: "idle" },
      });
      return;
    }
    setStore({
      actionError: null,
      actionNotice: null,
      loadingAction: { kind: "create-incident" },
    });
    try {
      const created = await createIncident(token!, {
        ...incidentForm,
        citizen_phone: incidentForm.citizen_phone || undefined,
        notes: incidentForm.notes || undefined,
      });
      const normalized = normalizeIncident(created);
      if (normalized)
        setStore((c) => ({
          state: { ...c.state, incidents: [normalized, ...c.state.incidents] },
        }));
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
    } catch (error) {
      setStore({
        actionError:
          error instanceof Error ? error.message : "Failed to create incident",
        loadingAction: { kind: "idle" },
      });
    }
  }

  // ── Vehicle actions ───────────────────────────────────────────────────────
  async function handleVehicleStatusSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVehicleID) return;
    setStore({
      loadingAction: { kind: "vehicle-status", vehicleID: selectedVehicleID },
    });
    try {
      const updated = await updateVehicleStatus(
        token!,
        selectedVehicleID,
        vehicleStatus,
      );
      setStore((c) => ({
        state: {
          ...c.state,
          vehicles: c.state.vehicles.map((v) =>
            v.id === selectedVehicleID ? { ...v, ...updated } : v,
          ),
        },
        actionNotice: "Status updated.",
        loadingAction: { kind: "idle" },
      }));
    } catch (error) {
      setStore({
        actionError:
          error instanceof Error ? error.message : "Failed to update status",
        loadingAction: { kind: "idle" },
      });
    }
  }

  async function handleVehicleLocationSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!selectedVehicleID) return;
    const latitude = parseFloat(vehicleLatitude);
    const longitude = parseFloat(vehicleLongitude);
    if (isNaN(latitude) || isNaN(longitude)) {
      setStore({ actionError: "Invalid coordinates." });
      return;
    }
    setStore({
      loadingAction: { kind: "vehicle-location", vehicleID: selectedVehicleID },
    });
    try {
      await updateVehicleLocation(
        token!,
        selectedVehicleID,
        latitude,
        longitude,
      );
      setStore((c) => ({
        state: {
          ...c.state,
          vehicles: c.state.vehicles.map((v) =>
            v.id === selectedVehicleID ? { ...v, latitude, longitude } : v,
          ),
        },
        actionNotice: "Location updated.",
        loadingAction: { kind: "idle" },
      }));
    } catch (error) {
      setStore({
        actionError:
          error instanceof Error ? error.message : "Failed to update location",
        loadingAction: { kind: "idle" },
      });
    }
  }

  // ── User management ───────────────────────────────────────────────────────
  async function handleLoadUsers() {
    setStore({ loadingAction: { kind: "load-users" } });
    try {
      const result = await getUsers(token!);
      setStore({ users: ensureArray(result), loadingAction: { kind: "idle" } });
    } catch (error) {
      setStore({
        actionError:
          error instanceof Error ? error.message : "Failed to load users",
        loadingAction: { kind: "idle" },
      });
    }
  }

  async function handleUpdateMyProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !state.profile) return;

    const trimmedName = myProfileName.trim();
    const hasNameChange = trimmedName.length > 0 && trimmedName !== state.profile.name;
    const hasPasswordChange = myProfilePassword.length > 0;

    if (!hasNameChange && !hasPasswordChange) {
      setStore({ actionNotice: "No profile changes to save.", actionError: null, openModal: null });
      return;
    }

    if (hasPasswordChange && myProfilePassword.length < 8) {
      setStore({ actionError: "Password must be at least 8 characters.", actionNotice: null });
      return;
    }

    if (hasPasswordChange && myProfilePassword !== myProfilePasswordConfirm) {
      setStore({ actionError: "Passwords do not match.", actionNotice: null });
      return;
    }

    setStore({ loadingAction: { kind: "update-profile" }, actionError: null, actionNotice: null });
    try {
      const updated = await updateMyProfile(token, {
        ...(hasNameChange ? { name: trimmedName } : {}),
        ...(hasPasswordChange ? { password: myProfilePassword } : {}),
      });

      setStore((cur) => ({
        state: {
          ...cur.state,
          profile: cur.state.profile ? { ...cur.state.profile, ...updated } : updated,
        },
        users: cur.users.map((user) => (user.id === updated.id ? { ...user, ...updated } : user)),
        actionNotice: "Profile updated.",
        actionError: null,
        loadingAction: { kind: "idle" },
        openModal: null,
      }));
      setMyProfilePassword("");
      setMyProfilePasswordConfirm("");
    } catch (error) {
      setStore({
        actionError: error instanceof Error ? error.message : "Failed to update profile",
        actionNotice: null,
        loadingAction: { kind: "idle" },
      });
    }
  }

  async function handleRegisterUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStore({
      actionError: null,
      actionNotice: null,
      loadingAction: { kind: editingUserID ? "update-user" : "register-user", userID: editingUserID ?? undefined } as any,
    });
    try {
      const input = {
        ...registerForm,
        station_id: registerForm.station_id || undefined,
      };
      if (editingUserID) {
        // Update existing user
        setStore({ loadingAction: { kind: "update-user", userID: editingUserID } as any });
        await updateUser(token!, editingUserID, {
          name: registerForm.name,
          role: registerForm.role,
          station_id: registerForm.station_id || undefined,
        });
        setStore({
          actionNotice: "User updated.",
          registerForm: {
            name: "",
            email: "",
            password: "",
            role: "hospital_admin",
            station_id: "",
          },
          editingUserID: "",
          loadingAction: { kind: "idle" },
        });
      } else {
        await registerUser(token!, input);
        setStore({
          actionNotice: "User registered.",
          registerForm: {
            name: "",
            email: "",
            password: "",
            role: "hospital_admin",
            station_id: "",
          },
          loadingAction: { kind: "idle" },
        });
      }
      await handleLoadUsers();
    } catch (error) {
      setStore({
        actionError:
          error instanceof Error ? error.message : "Registration failed",
        loadingAction: { kind: "idle" },
      });
    }
  }

  async function handleEditUser(user: { id: string; name: string; email: string; role: string; station_id?: string | null }) {
    setStore({
      registerForm: {
        name: user.name,
        email: user.email,
        password: "",
        role: user.role,
        station_id: user.station_id || "",
      },
      editingUserID: user.id,
      actionError: null,
      actionNotice: null,
    });
    // open the modal if not already open
    if (openModal !== "user-manage") setStore({ openModal: "user-manage" });
  }

  // open a confirmation modal for deleting a user
  function promptDeleteUser(userID: string) {
    setStore({ editingUserID: userID, openModal: "confirm-delete-user", actionError: null, actionNotice: null });
  }

  async function confirmDeleteUser() {
    if (!token) return;
    const userID = editingUserID;
    if (!userID) return;
    setStore({ actionError: null, actionNotice: null, loadingAction: { kind: "delete-user", userID } as any });
    try {
      await deleteUser(token, userID);
      setStore({ actionNotice: "User deleted.", loadingAction: { kind: "idle" }, editingUserID: "", openModal: null });
      await handleLoadUsers();
    } catch (error) {
      setStore({
        actionError: error instanceof Error ? error.message : "Failed to delete user",
        loadingAction: { kind: "idle" },
      });
    }
  }

  function cancelDeleteUser() {
    setStore({ editingUserID: "", openModal: null });
  }

  // ── Station management ────────────────────────────────────────────────────
  async function handleCreateStation() {
    if (!token) return;
    if (!isSystemAdmin) {
      setStore({
        actionError: "Only system admins can create stations.",
        loadingAction: { kind: "idle" },
      });
      return;
    }
    setStore({ loadingAction: { kind: "create-station" } });
    try {
      const created = await createStation(token, newStationForm as Partial<Station>);
      setStore((c: any) => ({
        state: {
          ...c.state,
          stations: [...ensureArray<Station>(c.state.stations), created],
        },
        actionNotice: "Station created successfully.",
        loadingAction: { kind: "idle" },
      }));
      setNewStationForm({
        name: "",
        type: "police",
        latitude: 5.6512,
        longitude: -0.1869,
        is_available: true,
        total_capacity: 0,
        available_capacity: 0,
        contact_phone: "",
      });
    } catch (e) {
      setStore({
        actionError:
          e instanceof Error ? e.message : "Failed to create station",
        loadingAction: { kind: "idle" },
      });
    }
  }

  // Open the confirm modal for station deletion
  function promptDeleteStation(stationID: string) {
    setStore({ editingStationID: stationID, openModal: "confirm-delete-station", actionError: null, actionNotice: null });
  }

  async function confirmDeleteStation() {
    if (!token) return;
    const stationID = editingStationID;
    if (!stationID) return;
    setStore({ actionError: null, actionNotice: null, loadingAction: { kind: "delete-station", stationID } as any });
    try {
      await deleteStation(token, stationID);
      setStore((c) => ({
        state: {
          ...c.state,
          stations: ensureArray<Station>(c.state.stations).filter((s) => s.id !== stationID),
        },
        actionNotice: "Station deleted.",
        loadingAction: { kind: "idle" },
        editingStationID: "",
        openModal: null,
      }));
    } catch (e) {
      setStore({
        actionError: e instanceof Error ? e.message : "Failed to delete station",
        loadingAction: { kind: "idle" },
      });
    }
  }

  function cancelDeleteStation() {
    setStore({ editingStationID: "", openModal: null });
  }

  async function handleUpdateStation(stationID: string) {
    const station = safeStations.find((s) => s.id === stationID);
    if (!station) return;
    setStore({
      actionError: null,
      actionNotice: null,
      loadingAction: { kind: "update-station", stationID },
    });
    try {
      const updated = await updateStation(token!, stationID, {
        name: station.name,
        type: station.type,
        latitude: station.latitude,
        longitude: station.longitude,
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
        loadingAction: { kind: "idle" },
      }));
    } catch (error) {
      setStore({
        actionError:
          error instanceof Error ? error.message : "Failed to update station",
        loadingAction: { kind: "idle" },
      });
    }
  }

  // ── Incident status ───────────────────────────────────────────────────────
  async function handleIncidentStatusChange(
    incidentID: string,
    status: string,
  ) {
    setStore({
      loadingAction: { kind: "incident-status", incidentID, status },
    });
    try {
      const updated = await updateIncidentStatus(token!, incidentID, status);
      setStore((c) => ({
        state: {
          ...c.state,
          incidents: c.state.incidents.map((i) =>
            i.id === incidentID ? { ...i, ...updated } : i,
          ),
        },
        actionNotice: "Status updated.",
        loadingAction: { kind: "idle" },
      }));
    } catch (error) {
      setStore({
        actionError:
          error instanceof Error ? error.message : "Failed to update status",
        loadingAction: { kind: "idle" },
      });
    }
  }
  void handleIncidentStatusChange; // prevent unused warning

  async function handleRefreshDashboard() {
    if (!token) return;
    setIsRefreshingDashboard(true);
    setStore({ actionError: null, dataError: null });
    try {
      const result = await loadDashboard(token, true);
      if (result) {
        setStore({ actionNotice: "Dashboard refreshed.", actionError: null });
      }
    } catch (error) {
      setStore({
        actionError:
          error instanceof Error ? error.message : "Failed to refresh dashboard",
        actionNotice: null,
      });
    } finally {
      setIsRefreshingDashboard(false);
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const isConnected = realtimeStatus === "live";
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isRefreshingDashboard, setIsRefreshingDashboard] = useState(false);
  const [actionNotifications, setActionNotifications] = useState<NotificationItem[]>([]);
  const lastActionSignatureRef = useRef<string>("");
  const alertsButtonRef = useRef<HTMLButtonElement | null>(null);
  const alertsPopoverRef = useRef<HTMLDivElement | null>(null);
  const [alertsPopoverStyle, setAlertsPopoverStyle] = useState<CSSProperties>({
    top: 0,
    left: 0,
  });

  const positionAlertsPopover = useCallback(() => {
    const trigger = alertsButtonRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const popoverWidth = 336; // matches w-84
    const viewportPadding = 12;
    const left = Math.max(
      viewportPadding,
      Math.min(rect.right - popoverWidth, window.innerWidth - popoverWidth - viewportPadding),
    );
    setAlertsPopoverStyle({
      top: rect.bottom + 8,
      left,
    });
  }, []);
  useEffect(() => {
    const message = actionError ?? actionNotice;
    if (!message) {
      lastActionSignatureRef.current = "";
      return;
    }

    const signature = `${actionError ? "error" : "notice"}:${message}`;
    if (signature === lastActionSignatureRef.current) return;
    lastActionSignatureRef.current = signature;

    const now = new Date();
    const notification: NotificationItem = {
      id: `action-${now.toISOString()}`,
      title: actionError ? "Action Failed" : "Action Complete",
      detail: message,
      time: now.toLocaleTimeString(),
      severity: actionError ? "warning" : "info",
      timestamp: now.getTime(),
    };

    setActionNotifications((current) => [notification, ...current].slice(0, 12));
    maybeNotifyDesktop(notification.title, notification.detail, notification.severity);
  }, [actionError, actionNotice]);

  const notificationItems = useMemo(() => {
    const realtimeItems: NotificationItem[] = safeRealtimeEvents.map((event) => {
      const payloadData = extractEnvelopeData(event.payload) ?? event.payload;
      const sev = eventSeverity(event.type, event.payload);
      const timestamp = Date.parse(event.receivedAt);
      return {
        id: `${event.type}-${event.receivedAt}`,
        title: titleCase(event.type.replace(/\./g, " ")),
        detail: formatNotificationDetail(payloadData),
        time: new Date(event.receivedAt).toLocaleTimeString(),
        severity: sev,
        timestamp: Number.isNaN(timestamp) ? Date.now() : timestamp,
      };
    });
    return [...actionNotifications, ...realtimeItems]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 12);
  }, [actionNotifications, safeRealtimeEvents]);

  useEffect(() => {
    if (!notificationsOpen) return;
    positionAlertsPopover();
    const onViewportChange = () => positionAlertsPopover();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [notificationsOpen, positionAlertsPopover]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const clickedTrigger =
        alertsButtonRef.current && alertsButtonRef.current.contains(target);
      const clickedPopover =
        alertsPopoverRef.current && alertsPopoverRef.current.contains(target);
      if (!clickedTrigger && !clickedPopover) {
        setNotificationsOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // ── Bootstrap spinner ─────────────────────────────────────────────────────
  if (isBootstrapping) {
    return (
      <main className="flex h-screen w-full items-center justify-center bg-background">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <span className="absolute h-16 w-16 rounded-full border border-accent/30" />
          <span className="absolute h-16 w-16 animate-spin rounded-full border-2 border-transparent border-t-accent border-r-accent/50" />
          <span className="absolute h-11 w-11 animate-[spin_1.15s_linear_reverse_infinite] rounded-full border border-signal/50" />
          <span className="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_14px_rgba(79,70,229,0.55)]" />
        </div>
      </main>
    );
  }

  // ── Login form ────────────────────────────────────────────────────────────
  if (!signedIn) {
    return (
      <main className="flex h-screen w-full overflow-hidden bg-background">
        <section className="flex w-full items-center justify-center px-4 py-8 md:w-1/2 md:px-8 lg:px-12">
          <div className="w-full max-w-105">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              Emergency Dispatch System
            </p>
            <h1 className="mt-2 text-[30px] font-semibold leading-tight text-foreground">
              Command Console Sign In
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Access your workspace to coordinate incidents, monitor units, and review operations analytics.
            </p>

            <Card className="mt-6">
              <CardHeader
                title="Sign in"
                description="Use your assigned credentials to continue."
              />
              <CardBody>
                <form className="space-y-4" onSubmit={handleLogin}>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-medium text-foreground/70">
                      Email
                    </span>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setStore({ email: e.target.value })}
                      placeholder="admin@dispatch.local"
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-medium text-foreground/70">
                      Password
                    </span>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setStore({ password: e.target.value })}
                      placeholder="••••••••"
                      required
                    />
                  </label>

                  {authError ? (
                    <div className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-[12px] font-medium text-danger">
                      {authError}
                    </div>
                  ) : null}

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isLoggingIn}
                    className="w-full"
                  >
                    {isLoggingIn ? "Signing in…" : "Sign in"}
                  </Button>
                </form>
              </CardBody>
            </Card>
          </div>
        </section>

        <section
          className="relative hidden md:block md:w-1/2"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1516574187841-cb9cc2ca948b?auto=format&fit=crop&w=1800&q=80')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-l from-black/10 via-black/35 to-background/75" />
          <div className="absolute bottom-8 left-8 right-8 rounded-xl border border-white/20 bg-black/35 px-5 py-4 backdrop-blur-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
              Live Operations
            </p>
            <p className="mt-2 text-[15px] font-semibold text-white">
              Coordinate emergency response with real-time dispatch visibility.
            </p>
          </div>
        </section>
      </main>
    );
  }

  // ── Signed-in layout ──────────────────────────────────────────────────────
  return (
    <>
      <main className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        {mobileNavOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
            className="fixed inset-0 z-30 bg-black/45 lg:hidden"
          />
        )}
        {/* ── Sidebar ───────────────────────────────────────────────────── */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-hidden border-r border-line bg-sidebar transition-transform duration-200 ease-out lg:relative lg:translate-x-0 lg:transition-[width] ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
        >
          <div
            className={`flex h-14 shrink-0 items-center border-b border-line ${
              sidebarExpanded ? "gap-2 px-3" : "justify-center px-1"
            }`}
          >
            {sidebarExpanded ? (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-panel-strong">
                <span className="h-2 w-2 rounded-full bg-foreground/70" />
              </div>
            ) : null}
            {sidebarExpanded ? (
              <span className="min-w-0 overflow-hidden whitespace-nowrap text-[13px] font-semibold text-foreground">
                Workspace
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setSidebarExpanded((v) => !v)}
              className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-panel-strong text-muted transition hover:text-foreground lg:flex ${
                sidebarExpanded ? "ml-auto" : "ml-0"
              }`}
              aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
            >
              {sidebarExpanded ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Nav */}
          <nav className="flex flex-1 flex-col gap-0.5 overflow-hidden px-1.5 py-2.5">
            {visibleNavEntries.map((entry) => {
              const active =
                pathname === entry.href ||
                (entry.href !== "/operations" &&
                  pathname.startsWith(entry.href + "/"));
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className={`figma-nav-item ${active ? "active" : ""}`}
                >
                  <span className="shrink-0">{entry.icon}</span>
                  <span
                    className={`overflow-hidden whitespace-nowrap transition-opacity duration-150 ${
                      sidebarExpanded ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    {entry.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          {/* Bottom */}
          <div className="flex flex-col gap-0.5 overflow-hidden border-t border-line px-1.5 py-2.5">
            {/* Theme toggle */}
            <button
              type="button"
              onClick={() =>
                setStore((c) => ({
                  theme: c.theme === "dark" ? "light" : "dark",
                }))
              }
              className="figma-nav-item"
            >
              <span className="shrink-0">
                {theme === "dark" ? (
                  <SunIcon className="h-4.5 w-4.5" />
                ) : (
                  <MoonIcon className="h-4.5 w-4.5" />
                )}
              </span>
              <span
                className={`overflow-hidden whitespace-nowrap transition-opacity duration-150 ${
                  sidebarExpanded ? "opacity-100" : "opacity-0"
                }`}
              >
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </span>
            </button>

            {/* Sign out */}
            <button
              type="button"
              onClick={handleSignOut}
              className="figma-nav-item text-danger/70 hover:text-danger"
            >
              <span className="shrink-0">
                <LogOutIcon className="h-4.5 w-4.5" />
              </span>
              <span
                className={`overflow-hidden whitespace-nowrap transition-opacity duration-150 ${
                  sidebarExpanded ? "opacity-100" : "opacity-0"
                }`}
              >
                Sign out
              </span>
            </button>

            {/* Avatar */}
            <div className="figma-nav-item mt-0.5 cursor-default select-none">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[11px] font-bold text-accent">
                {profileInitial}
              </div>
              <div className="min-w-0 overflow-hidden">
                <p
                  className={`truncate whitespace-nowrap text-[12px] font-medium text-foreground transition-opacity duration-150 ${
                    sidebarExpanded ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {state.profile?.name ?? "User"}
                </p>
                <p
                  className={`truncate whitespace-nowrap text-[11px] text-muted transition-opacity duration-150 ${
                    sidebarExpanded ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {titleCase(state.profile?.role ?? "")}
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Content area ──────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <header className="flex h-auto min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-background/80 px-3 py-2 backdrop-blur-md sm:px-4 lg:h-14 lg:flex-nowrap lg:gap-3 lg:px-6 lg:py-0">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                aria-label="Open navigation"
                onClick={() => {
                  setSidebarExpanded(true);
                  setMobileNavOpen(true);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-panel text-muted transition hover:text-foreground lg:hidden"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
              <h2 className="text-[14px] font-semibold leading-tight text-foreground">
                {workspaceTitle}
              </h2>
              <div className="mt-0.5 hidden items-center gap-1.5 sm:flex">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isConnected
                      ? "bg-signal shadow-[0_0_5px_rgba(20,174,92,0.7)]"
                      : "bg-warning"
                  }`}
                />
                <span className="text-[11px] text-muted">
                  {titleCase(state.profile?.role ?? "Guest")} · Realtime{" "}
                  {realtimeStatus}
                </span>
              </div>
            </div>

            {/* Header actions */}
            <div className="flex w-full min-w-0 items-center justify-end gap-2 overflow-x-auto scrollbar-hidden sm:w-auto sm:gap-3">
              {/* Utility actions */}
              <div className="flex min-w-max items-center gap-2">
                {/* Refresh icon */}
                <button
                  type="button"
                  onClick={() => {
                    void handleRefreshDashboard();
                  }}
                  disabled={isRefreshingDashboard || !token}
                  className="hidden h-8 w-8 items-center justify-center rounded-lg border border-line bg-panel text-muted transition hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed sm:flex"
                  title="Refresh dashboard"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isRefreshingDashboard ? "animate-spin" : ""}`}
                  />
                </button>

                {/* Alerts */}
                <div className="relative">
                  <Button
                    ref={alertsButtonRef}
                    type="button"
                    variant="secondary"
                    size="sm"
                    aria-label="Alerts"
                    onClick={() => {
                      setNotificationsOpen((c) => {
                        const next = !c;
                        if (next) positionAlertsPopover();
                        return next;
                      });
                    }}
                    leftIcon={
                      <div className="relative inline-flex">
                        <Bell className="h-3.5 w-3.5" />
                        {notificationItems.length > 0 && (
                          <span className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white">
                            {notificationItems.length > 9 ? "9+" : notificationItems.length}
                          </span>
                        )}
                      </div>
                    }
                  >
                    <span className="hidden lg:inline">Alerts</span>
                  </Button>
                  {notificationsOpen && (
                    <Portal>
                      <div
                        ref={alertsPopoverRef}
                        style={alertsPopoverStyle}
                        className="fixed z-[9999] w-84 overflow-hidden rounded-xl border border-line bg-panel shadow-[0_16px_56px_rgba(0,0,0,0.28)]"
                      >
                        <div className="border-b border-line px-4 py-3">
                          <p className="text-[12px] font-semibold text-foreground">
                            Notifications
                          </p>
                        </div>
                        <div className="max-h-72 overflow-y-auto">
                          {notificationItems.length === 0 ? (
                            <p className="px-4 py-4 text-[12px] text-muted">
                              No alerts yet.
                            </p>
                          ) : (
                            notificationItems.map((item) => (
                              <div
                                key={item.id}
                                className="border-b border-line px-4 py-3 last:border-b-0"
                              >
                                <p className="text-[12px] font-medium text-foreground">
                                  {item.title}
                                </p>
                                <p className="mt-1 text-[11px] text-muted">
                                  {item.time}
                                </p>
                                <p className="mt-1 line-clamp-2 text-[11px] text-muted/80">
                                  {item.detail}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </Portal>
                  )}
                </div>
              </div>

              {/* Account */}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label="My Profile"
                onClick={() => {
                  setMyProfileName(state.profile?.name ?? "");
                  setMyProfilePassword("");
                  setMyProfilePasswordConfirm("");
                  setStore({ openModal: "my-profile", actionError: null, actionNotice: null });
                }}
                leftIcon={<UsersIcon className="h-3.5 w-3.5" />}
                className="hidden md:inline-flex"
              >
                <span className="hidden lg:inline">My Profile</span>
              </Button>

              {/* Primary action */}
              {canManageIncidents && (
                <Button
                  type="button"
                  variant="primary"
                  aria-label="Dispatch"
                  onClick={() => setStore({ openModal: "incident-intake" })}
                  leftIcon={<PlusIcon className="h-3.5 w-3.5" />}
                  className="hidden md:inline-flex"
                >
                  <span className="hidden lg:inline">Dispatch</span>
                </Button>
              )}
              <div className="flex min-w-max items-center gap-1.5 border-l border-line pl-2">
                {canControlVehicles && (
                  <button
                    type="button"
                    onClick={() => setStore({ openModal: "vehicle-command" })}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-[12px] font-medium text-muted transition hover:border-accent/50 hover:text-foreground"
                  >
                    <CarIcon className="h-3.5 w-3.5" />
                    <span className="hidden md:block">Fleet</span>
                  </button>
                )}
                {(isDepartmentAdmin || isSystemAdmin) && (
                  <button
                    type="button"
                    onClick={() => setStore({ openModal: "station-manage" })}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-[12px] font-medium text-muted transition hover:border-accent/50 hover:text-foreground"
                  >
                    <BuildingIcon className="h-3.5 w-3.5" />
                    <span className="hidden md:block">Stations</span>
                  </button>
                )}
                {isSystemAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setStore({ openModal: "user-manage" });
                      void handleLoadUsers();
                    }}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-[12px] font-medium text-muted transition hover:border-accent/50 hover:text-foreground"
                  >
                    <UsersIcon className="h-3.5 w-3.5" />
                    <span className="hidden md:block">Users</span>
                  </button>
                )}
              </div>
            </div>
          </header>

          {/* Notices */}
          {(actionNotice || actionError) && (
            <Portal>
              <div className="pointer-events-none fixed right-4 top-18 z-[12000] w-[min(30rem,calc(100vw-2rem))]">
                <div
                  className={`pointer-events-auto flex items-start justify-between gap-3 rounded-xl border px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.32)] backdrop-blur ${actionError ? "border-danger/35 bg-danger/12 text-danger" : "border-signal/30 bg-signal/12 text-signal"}`}
                  role="status"
                  aria-live="polite"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider opacity-90">
                      {actionError ? "Action Failed" : "Action Complete"}
                    </p>
                    <p className="mt-1 text-[12px] font-medium leading-relaxed text-foreground">
                      {actionError ?? actionNotice}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setStore({ actionError: null, actionNotice: null })
                    }
                    className="shrink-0 rounded-md border border-line/40 bg-panel-strong/60 p-1.5 text-muted transition hover:text-foreground"
                    aria-label="Dismiss notification"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </Portal>
          )}

          {/* Page content */}
          <div className="app-scroll relative z-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1680px] px-4 py-4 lg:px-6 lg:py-6">
              {children}
            </div>
          </div>
        </div>
      </main>

      {/* ── Modal overlay ─────────────────────────────────────────────────── */}
      <Modal
        open={Boolean(openModal)}
        onClose={() => setStore({ openModal: null })}
        size={
          openModal === "incident-intake"
            ? "xl"
            : openModal === "vehicle-command"
              ? "md"
              : openModal === "my-profile"
                ? "md"
              : openModal === "station-manage" || openModal === "user-manage"
                ? "xl"
                : "sm"
        }
        footer={
          openModal
            ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-muted">
                  Press Esc or use the close button to dismiss.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setStore({ openModal: null })}
                >
                  Close
                </Button>
              </div>
            )
            : null
        }
      >

            {/* ── Incident intake ── */}
            {openModal === "incident-intake" && canManageIncidents && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
                  New Incident
                </p>
                <h3 className="mt-1.5 text-[17px] font-semibold text-foreground">
                  Create an active case
                </h3>
                <p className="mt-0.5 text-[12px] text-muted">
                  {safeStations.length} stations available for dispatch
                </p>
                <form
                  className="mt-5 grid gap-4"
                  onSubmit={handleCreateIncident}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5 text-[12px] font-medium text-foreground/80">
                      Citizen name
                      <input
                        value={incidentForm.citizen_name}
                        onChange={(e) =>
                          handleIncidentFieldChange(
                            "citizen_name",
                            e.target.value,
                          )
                        }
                        className="rounded-lg border border-line bg-background px-3 py-2.5 text-[13px] text-foreground outline-none focus:border-accent"
                        placeholder="Full name"
                        required
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-[12px] font-medium text-foreground/80">
                      Phone
                      <input
                        type="number"
                        value={incidentForm.citizen_phone ?? ""}
                        onChange={(e) =>
                          handleIncidentFieldChange(
                            "citizen_phone",
                            e.target.value,
                          )
                        }
                        className="rounded-lg border border-line bg-background px-3 py-2.5 text-[13px] text-foreground outline-none focus:border-accent"
                        placeholder="Contact number"
                      />
                    </label>
                  </div>
                  <label className="flex flex-col gap-1.5 text-[12px] font-medium text-foreground/80">
                    Incident type
                    <select
                      value={incidentForm.incident_type}
                      onChange={(e) =>
                        handleIncidentFieldChange(
                          "incident_type",
                          e.target.value,
                        )
                      }
                      className="rounded-lg border border-line bg-background px-3 py-2.5 text-[13px] text-foreground outline-none focus:border-accent"
                    >
                      <option value="medical">Medical</option>
                      <option value="fire">Fire</option>
                      <option value="crime">Crime</option>
                    </select>
                  </label>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[12px] font-medium text-foreground/80">
                      Incident location{" "}
                      <span className="text-muted">
                        (click map to place pin)
                      </span>
                    </p>
                    <LocationPicker
                      latitude={incidentForm.latitude}
                      longitude={incidentForm.longitude}
                      onLocationSelect={(lat, lng) => {
                        handleIncidentFieldChange("latitude", lat);
                        handleIncidentFieldChange("longitude", lng);
                      }}
                      className="h-48 w-full overflow-hidden rounded-lg border border-line"
                    />
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg border border-line bg-background px-3 py-2">
                        <p className="font-semibold uppercase tracking-wider text-muted">
                          Lat
                        </p>
                        <p className="mt-0.5 font-medium text-foreground">
                          {incidentForm.latitude.toFixed(5)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-line bg-background px-3 py-2">
                        <p className="font-semibold uppercase tracking-wider text-muted">
                          Lng
                        </p>
                        <p className="mt-0.5 font-medium text-foreground">
                          {incidentForm.longitude.toFixed(5)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <label className="flex flex-col gap-1.5 text-[12px] font-medium text-foreground/80">
                    Notes
                    <textarea
                      value={incidentForm.notes ?? ""}
                      onChange={(e) =>
                        handleIncidentFieldChange("notes", e.target.value)
                      }
                      className="min-h-20 rounded-lg border border-line bg-background px-3 py-2.5 text-[13px] text-foreground outline-none focus:border-accent"
                      placeholder="Additional details…"
                    />
                  </label>
                  {actionError && (
                    <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12px] text-danger">
                      {actionError}
                    </p>
                  )}
                  <div className="flex gap-2 justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => setStore({ openModal: null })}
                      className="rounded-lg border border-line px-4 py-2 text-[12px] font-medium text-muted transition hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCreatingIncident}
                      className="rounded-lg bg-accent px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
                    >
                      {isCreatingIncident ? "Creating…" : "Create Incident"}
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* ── Vehicle command ── */}
            {openModal === "my-profile" && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
                  My Profile
                </p>
                <h3 className="mt-1.5 text-[17px] font-semibold text-foreground">
                  Update personal details
                </h3>
                <p className="mt-0.5 text-[12px] text-muted">
                  You can edit non-critical fields only.
                </p>
                <form className="mt-5 grid gap-4" onSubmit={handleUpdateMyProfile}>
                  <label className="flex flex-col gap-1.5 text-[12px] font-medium text-foreground/80">
                    Full name
                    <input
                      value={myProfileName}
                      onChange={(e) => setMyProfileName(e.target.value)}
                      className="rounded-lg border border-line bg-background px-3 py-2.5 text-[13px] text-foreground outline-none focus:border-accent"
                      placeholder="Your display name"
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-[12px] font-medium text-foreground/80">
                    New password (optional)
                    <input
                      type="password"
                      value={myProfilePassword}
                      onChange={(e) => setMyProfilePassword(e.target.value)}
                      className="rounded-lg border border-line bg-background px-3 py-2.5 text-[13px] text-foreground outline-none focus:border-accent"
                      placeholder="Leave blank to keep current password"
                      minLength={8}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-[12px] font-medium text-foreground/80">
                    Confirm new password
                    <input
                      type="password"
                      value={myProfilePasswordConfirm}
                      onChange={(e) => setMyProfilePasswordConfirm(e.target.value)}
                      className="rounded-lg border border-line bg-background px-3 py-2.5 text-[13px] text-foreground outline-none focus:border-accent"
                      placeholder="Re-enter new password"
                      minLength={8}
                    />
                  </label>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setStore({ openModal: null })}
                      className="rounded-lg border border-line px-4 py-2 text-[12px] font-medium text-muted transition hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loadingAction.kind === "update-profile"}
                      className="rounded-lg bg-accent px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
                    >
                      {loadingAction.kind === "update-profile" ? "Saving..." : "Save profile"}
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* ── Vehicle command ── */}
            {openModal === "vehicle-command" && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-signal">
                  Fleet Control
                </p>
                <h3 className="mt-1.5 text-[17px] font-semibold text-foreground">
                  Manage vehicles
                </h3>
                <p className="mt-0.5 text-[12px] text-muted">
                  {filteredVehicles.length} vehicles in fleet
                </p>
                <div className="mt-5 grid gap-4">
                  <label className="flex flex-col gap-1.5 text-[12px] font-medium text-foreground/80">
                    Select vehicle
                    <select
                      value={selectedVehicleID}
                      onChange={(e) =>
                        setStore({ selectedVehicleID: e.target.value })
                      }
                      className="rounded-lg border border-line bg-background px-3 py-2.5 text-[13px] text-foreground outline-none focus:border-accent"
                    >
                      {filteredVehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {(v.license_plate || v.id.slice(0, 8)) +
                            " — " +
                            titleCase(v.status)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedVehicle && (
                    <div className="rounded-lg border border-line bg-background px-3.5 py-3 text-[12px] text-muted">
                      <p className="font-semibold text-foreground">
                        {selectedVehicle.license_plate ||
                          selectedVehicle.id.slice(0, 8)}
                      </p>
                      <p className="mt-0.5">
                        {titleCase(selectedVehicle.vehicle_type)} · Driver:{" "}
                        {selectedVehicle.driver_name || "Unassigned"}
                      </p>
                    </div>
                  )}
                  <form
                    className="grid gap-3"
                    onSubmit={handleVehicleStatusSubmit}
                  >
                    <label className="flex flex-col gap-1.5 text-[12px] font-medium text-foreground/80">
                      Update status
                      <select
                        value={vehicleStatus}
                        onChange={(e) =>
                          setStore({ vehicleStatus: e.target.value })
                        }
                        className="rounded-lg border border-line bg-background px-3 py-2.5 text-[13px] text-foreground outline-none focus:border-accent"
                        disabled={!selectedVehicleID}
                      >
                        <option value="available">Available</option>
                        <option value="en_route">En Route</option>
                        <option value="at_scene">At Scene</option>
                        <option value="returning">Returning</option>
                        <option value="off_duty">Off Duty</option>
                      </select>
                    </label>
                    <button
                      type="submit"
                      disabled={isUpdatingVehicleStatus || !selectedVehicleID}
                      className="rounded-lg border border-line px-4 py-2 text-[12px] font-medium text-foreground transition hover:bg-nav-hover disabled:opacity-50"
                    >
                      {isUpdatingVehicleStatus ? "Updating…" : "Update Status"}
                    </button>
                  </form>
                  <div className="border-t border-line pt-4">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Move vehicle
                    </p>
                    <LocationPicker
                      latitude={Number(vehicleLatitude) || 0}
                      longitude={Number(vehicleLongitude) || 0}
                      onLocationSelect={(lat, lng) => {
                        setStore({ vehicleLatitude: lat.toFixed(4), vehicleLongitude: lng.toFixed(4) });
                      }}
                      className="h-48 w-full overflow-hidden rounded-lg border border-line"
                    />

                    <form
                      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                      onSubmit={handleVehicleLocationSubmit}
                    >
                      <label className="flex flex-col gap-1.5 text-[12px] font-medium text-foreground/80">
                        Latitude
                        <input
                          type="number"
                          step="0.0001"
                          value={vehicleLatitude}
                          onChange={(e) =>
                            setStore({ vehicleLatitude: e.target.value })
                          }
                          className="rounded-lg border border-line bg-background px-3 py-2.5 text-[13px] outline-none focus:border-accent"
                          disabled={!selectedVehicleID}
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-[12px] font-medium text-foreground/80">
                        Longitude
                        <input
                          type="number"
                          step="0.0001"
                          value={vehicleLongitude}
                          onChange={(e) =>
                            setStore({ vehicleLongitude: e.target.value })
                          }
                          className="rounded-lg border border-line bg-background px-3 py-2.5 text-[13px] outline-none focus:border-accent"
                          disabled={!selectedVehicleID}
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={
                          isUpdatingVehicleLocation || !selectedVehicleID
                        }
                        className="rounded-lg bg-foreground px-4 py-2.5 text-[12px] font-semibold text-background transition hover:opacity-90 disabled:opacity-50"
                      >
                        {isUpdatingVehicleLocation ? "Moving…" : "Move"}
                      </button>
                    </form>
                  </div>
                </div>
              </>
            )}

            {/* ── Station manage ── */}
            {openModal === "station-manage" && (
              <div className="flex flex-col gap-6">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-signal">
                    Infrastructure
                  </p>
                  <h3 className="mt-1.5 text-[17px] font-semibold text-foreground">
                    Station Management
                  </h3>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {safeStations.length} stations registered
                  </p>
                </div>

                {/* Create New Station form — Only for system admins */}
                {isSystemAdmin && (
                  <div className="rounded-xl border border-line bg-panel p-5">
                    <h4 className="mb-4 text-[13px] font-bold uppercase tracking-wider text-foreground">
                      Add New Station
                    </h4>
                    <div className="grid gap-3.5">
                      <label className="flex flex-col gap-1.5 text-[11px] font-medium text-muted/80">
                        Station Name
                        <input
                          placeholder="e.g., East Legon Police"
                          value={newStationForm.name || ""}
                          onChange={(e) =>
                            setNewStationForm((p) => ({ ...p, name: e.target.value }))
                          }
                          className="rounded-lg border border-line bg-panel-strong px-3 py-2 text-[12px] text-foreground outline-none focus:border-accent"
                        />
                      </label>
                      <div className="grid grid-cols-2 items-end gap-3.5">
                        <label className="flex flex-col gap-1.5 text-[11px] font-medium text-muted/80">
                          Type
                          <select
                            value={newStationForm.type || "police"}
                            onChange={(e) =>
                              setNewStationForm((p) => ({ ...p, type: e.target.value }))
                            }
                            className="rounded-lg border border-line bg-panel-strong px-2.5 py-2 text-[12px] text-foreground outline-none focus:border-accent"
                          >
                            <option value="police">Police Station</option>
                            <option value="fire">Fire Station</option>
                            <option value="hospital">Hospital / Medical</option>
                          </select>
                        </label>
                        <Toggle
                          label="Is Available"
                          checked={newStationForm.is_available ?? true}
                          onChange={(v) =>
                            setNewStationForm((p) => ({ ...p, is_available: v }))
                          }
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <p className="text-[11px] font-medium text-muted/80">Location</p>
                          <LocationPicker
                            latitude={Number(newStationForm.latitude) || 0}
                            longitude={Number(newStationForm.longitude) || 0}
                            onLocationSelect={(lat, lng) => {
                              setNewStationForm((p) => ({ ...p, latitude: lat, longitude: lng }));
                            }}
                            className="h-44 w-full overflow-hidden rounded-lg border border-line"
                          />
                          <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                          <input
                            type="number"
                            placeholder="Lat"
                            value={String(newStationForm.latitude ?? "")}
                            onChange={(e) =>
                              setNewStationForm((p) => ({
                                ...p,
                                latitude: Number(e.target.value),
                              }))
                            }
                            className="rounded-lg border border-line bg-panel-strong px-3 py-2 text-[12px] text-foreground outline-none focus:border-accent"
                          />
                          <input
                            type="number"
                            placeholder="Lng"
                            value={String(newStationForm.longitude ?? "")}
                            onChange={(e) =>
                              setNewStationForm((p) => ({
                                ...p,
                                longitude: Number(e.target.value),
                              }))
                            }
                            className="rounded-lg border border-line bg-panel-strong px-3 py-2 text-[12px] text-foreground outline-none focus:border-accent"
                          />
                          <button
                            type="button"
                            onClick={() => setStore({ isPickingLocation: true })}
                            className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                              isPickingLocation
                                ? "border-accent bg-accent/10 text-accent animate-pulse"
                                : "border-line bg-panel-strong text-muted hover:border-accent hover:text-accent"
                            }`}
                            title="Pick from map"
                          >
                            <MapPinIcon className="h-4 w-4" />
                          </button>
                        </div>
                        {isPickingLocation && (
                          <p className="mt-1 text-[10px] font-bold text-accent animate-pulse">
                            Pick a location on the main map…
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleCreateStation}
                        disabled={loadingAction.kind === "create-station" || !newStationForm.name}
                        className="mt-1 rounded-lg bg-accent px-4 py-2 text-[12px] font-bold text-white transition hover:bg-accent/90 disabled:opacity-50"
                      >
                        {loadingAction.kind === "create-station"
                          ? "Saving…"
                          : "Save Station"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Existing Stations List */}
                <div className="space-y-4">
                  <h4 className="text-[13px] font-bold uppercase tracking-wider text-foreground">
                    Registered Stations
                  </h4>
                  {safeStations
                    .filter(
                      (s) =>
                        isSystemAdmin || s.id === state.profile?.station_id,
                    )
                    .map((station) => (
                      <div
                        key={station.id}
                        className="rounded-xl border border-line bg-panel p-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                station.is_available ? "bg-signal" : "bg-danger"
                              }`}
                            />
                            <div>
                              <p className="text-[14px] font-bold text-foreground">
                                {station.name}
                              </p>
                              <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
                                {titleCase(station.type)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setStore({
                                  editingStationID:
                                    editingStationID === station.id
                                      ? ""
                                      : station.id,
                                })
                              }
                              title={editingStationID === station.id ? "Cancel edit" : "Edit station"}
                              className={`rounded-md p-2 transition ${
                                editingStationID === station.id
                                  ? "border border-accent bg-accent/10 text-accent"
                                  : "border border-line bg-panel-strong text-muted hover:text-foreground"
                              }`}
                            >
                              {editingStationID === station.id ? (
                                <XIcon className="h-4 w-4" />
                              ) : (
                                <PencilIcon className="h-4 w-4" />
                              )}
                            </button>
                            {isSystemAdmin && (
                              <button
                                type="button"
                                onClick={() => promptDeleteStation(station.id)}
                                disabled={
                                  loadingAction.kind === "delete-station" &&
                                  (loadingAction as any).stationID === station.id
                                }
                                className="rounded-lg border border-line bg-panel-strong p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger"
                                title="Delete station"
                              >
                                <XCircleIcon className="h-4.5 w-4.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {editingStationID === station.id && (
                          <div className="mt-4 grid gap-3.5 border-t border-line/60 pt-4">
                            <label className="flex flex-col gap-1.5 text-[11px] font-medium text-muted/80">
                              Name
                              <input
                                value={station.name}
                                onChange={(e) =>
                                  updateStationField(station.id, "name", e.target.value)
                                }
                                className="rounded-lg border border-line bg-panel-strong px-3 py-2 text-[12px] text-foreground outline-none focus:border-accent"
                              />
                            </label>

                            <div className="grid grid-cols-2 items-end gap-3.5">
                              <label className="flex flex-col gap-1.5 text-[11px] font-medium text-muted/80">
                                Contact Phone
                                <input
                                  type="number"
                                  value={station.contact_phone || ""}
                                  onChange={(e) =>
                                    updateStationField(station.id, "contact_phone", e.target.value)
                                  }
                                  className="rounded-lg border border-line bg-panel-strong px-3 py-2 text-[12px] text-foreground outline-none focus:border-accent"
                                />
                              </label>
                              <Toggle
                                label="Available"
                                checked={station.is_available}
                                onChange={(v) =>
                                  updateStationField(station.id, "is_available", v)
                                }
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3.5">
                              <label className="flex flex-col gap-1.5 text-[11px] font-medium text-muted/80">
                                Capacity
                                <input
                                  type="number"
                                  value={station.total_capacity ?? 0}
                                  onChange={(e) =>
                                    updateStationField(
                                      station.id,
                                      "total_capacity",
                                      Number(e.target.value),
                                    )
                                  }
                                  className="rounded-lg border border-line bg-panel-strong px-3 py-2 text-[12px] text-foreground outline-none focus:border-accent"
                                />
                              </label>
                              <label className="flex flex-col gap-1.5 text-[11px] font-medium text-muted/80">
                                Available
                                <input
                                  type="number"
                                  value={station.available_capacity ?? 0}
                                  onChange={(e) =>
                                    updateStationField(
                                      station.id,
                                      "available_capacity",
                                      Number(e.target.value),
                                    )
                                  }
                                  className="rounded-lg border border-line bg-panel-strong px-3 py-2 text-[12px] text-foreground outline-none focus:border-accent"
                                />
                              </label>
                            </div>

                            <div className="flex flex-col gap-1.5 pt-1">
                              <p className="text-[11px] font-medium text-muted/80">Location</p>
                              <LocationPicker
                                latitude={Number(station.latitude) || 0}
                                longitude={Number(station.longitude) || 0}
                                onLocationSelect={(lat, lng) => {
                                  updateStationField(station.id, "latitude", lat);
                                  updateStationField(station.id, "longitude", lng);
                                }}
                                className="h-44 w-full overflow-hidden rounded-lg border border-line"
                              />
                              <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                                <input
                                  type="number"
                                  value={station.latitude}
                                  onChange={(e) =>
                                    updateStationField(station.id, "latitude", Number(e.target.value))
                                  }
                                  className="rounded-lg border border-line bg-panel-strong px-3 py-2 text-[12px] text-foreground outline-none focus:border-accent"
                                />
                                <input
                                  type="number"
                                  value={station.longitude}
                                  onChange={(e) =>
                                    updateStationField(station.id, "longitude", Number(e.target.value))
                                  }
                                  className="rounded-lg border border-line bg-panel-strong px-3 py-2 text-[12px] text-foreground outline-none focus:border-accent"
                                />
                                <button
                                  type="button"
                                  onClick={() => setStore({ isPickingLocation: true })}
                                  className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                                    isPickingLocation
                                      ? "border-accent bg-accent/10 text-accent animate-pulse"
                                      : "border-line bg-panel-strong text-muted hover:border-accent hover:text-accent"
                                  }`}
                                  title="Pick from map"
                                >
                                  <MapPinIcon className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => void handleUpdateStation(station.id)}
                              disabled={
                                loadingAction.kind === "update-station" &&
                                loadingAction.stationID === station.id
                              }
                              className="mt-1 rounded-lg bg-accent px-4 py-2.5 text-[12px] font-bold text-white transition hover:bg-accent/90 disabled:opacity-50"
                            >
                              {loadingAction.kind === "update-station" &&
                              loadingAction.stationID === station.id
                                ? "Saving Changes…"
                                : "Update Station"}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  {safeStations.length === 0 && (
                    <p className="rounded-xl border border-dashed border-line bg-background py-10 text-center text-[12px] text-muted">
                      No stations found in registry.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── User manage ── */}
            {openModal === "user-manage" && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
                  User Management
                </p>
                <h3 className="mt-1.5 text-[17px] font-semibold text-foreground">
                  System users
                </h3>
                <p className="mt-0.5 text-[12px] text-muted">
                  {users.length} registered accounts
                </p>
                <form
                  className="mt-5 grid gap-3 rounded-xl border border-line bg-background p-4"
                  onSubmit={handleRegisterUser}
                >
                  <p className="text-[12px] font-semibold text-foreground">
                    Register new user
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={registerForm.name}
                      onChange={(e) =>
                        setStore((c) => ({
                          registerForm: {
                            ...c.registerForm,
                            name: e.target.value,
                          },
                        }))
                      }
                      placeholder="Full name"
                      required
                      className="rounded-lg border border-line bg-panel px-3 py-2 text-[12px] text-foreground outline-none focus:border-accent"
                    />
                    <input
                      type="email"
                      value={registerForm.email}
                      onChange={(e) =>
                        setStore((c) => ({
                          registerForm: {
                            ...c.registerForm,
                            email: e.target.value,
                          },
                        }))
                      }
                      placeholder="Email"
                      required
                      className="rounded-lg border border-line bg-panel px-3 py-2 text-[12px] text-foreground outline-none focus:border-accent"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="password"
                      value={registerForm.password}
                      onChange={(e) =>
                        setStore((c) => ({
                          registerForm: {
                            ...c.registerForm,
                            password: e.target.value,
                          },
                        }))
                      }
                      placeholder={editingUserID ? "Password (leave blank to keep)" : "Password (min 8 chars)"}
                      required={!editingUserID}
                      minLength={editingUserID ? undefined : 8}
                      className="rounded-lg border border-line bg-panel px-3 py-2 text-[12px] text-foreground outline-none focus:border-accent"
                    />
                    <select
                      value={registerForm.role}
                        onChange={(e) => {
                          const newRole = e.target.value;
                          setStore((c) => {
                            // If the previously selected station doesn't match the
                            // newly selected role, clear it so users pick a valid one.
                            const allowed = roleToStationType(newRole);
                            const currentStation = c.registerForm.station_id ?? "";
                            let newStationID = currentStation;
                            if (currentStation && allowed) {
                              const station = (c.state?.stations ?? []).find((s: any) => s.id === currentStation);
                              if (station && station.type !== allowed) {
                                newStationID = "";
                              }
                            }
                            return {
                              registerForm: {
                                ...c.registerForm,
                                role: newRole,
                                station_id: newStationID,
                              },
                            };
                          });
                        }}
                      className="rounded-lg border border-line bg-panel px-3 py-2 text-[12px] text-foreground outline-none focus:border-accent"
                    >
                      <option value="system_admin">System Admin</option>
                      <option value="hospital_admin">Hospital Admin</option>
                      <option value="police_admin">Police Admin</option>
                      <option value="fire_admin">Fire Admin</option>
                      <option value="ambulance_driver">Ambulance Driver</option>
                      <option value="police_driver">Police Driver</option>
                      <option value="fire_driver">Fire Driver</option>
                    </select>
                  </div>
                  <select
                    value={registerForm.station_id ?? ""}
                    onChange={(e) =>
                      setStore((c) => ({
                        registerForm: {
                          ...c.registerForm,
                          station_id: e.target.value,
                        },
                      }))
                    }
                    className="rounded-lg border border-line bg-panel px-3 py-2 text-[12px] text-foreground outline-none focus:border-accent"
                  >
                    <option value="">No station</option>
                    {(() => {
                      const allowed = roleToStationType(registerForm.role);
                      return safeStations
                        .filter((s) => !allowed || s.type === allowed)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ));
                    })()}
                  </select>
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={
                        loadingAction.kind === "register-user" ||
                        loadingAction.kind === "update-user"
                      }
                      className="rounded-lg bg-accent px-4 py-2 text-[12px] font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
                    >
                      {loadingAction.kind === "register-user"
                        ? "Registering…"
                        : loadingAction.kind === "update-user"
                        ? "Saving…"
                        : editingUserID
                        ? "Save Changes"
                        : "Register User"}
                    </button>
                    {editingUserID && (
                      <button
                        type="button"
                        onClick={() =>
                          setStore({
                            editingUserID: "",
                            registerForm: {
                              name: "",
                              email: "",
                              password: "",
                              role: "hospital_admin",
                              station_id: "",
                            },
                          })
                        }
                        className="rounded-lg border border-line bg-panel px-4 py-2 text-[12px] font-medium text-foreground hover:bg-panel/95"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
                <div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto">
                  {users
                    .filter(
                      (u) =>
                        isSystemAdmin || u.station_id === state.profile?.station_id,
                    )
                    .map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-background px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-foreground">
                          {user.name}
                        </p>
                        <p className="truncate text-[11px] text-muted">
                          {user.email}
                        </p>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                          {titleCase(user.role)}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleEditUser(user)}
                          title="Edit user"
                          className="rounded-md border border-line bg-panel p-2 text-foreground hover:bg-panel/95"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void promptDeleteUser(user.id)}
                          disabled={
                            loadingAction.kind === "delete-user" &&
                            (loadingAction as any).userID === user.id
                          }
                          title="Delete user"
                          className="rounded-md border border-line bg-red-600 p-2 text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {loadingAction.kind === "delete-user" && (loadingAction as any).userID === user.id ? (
                            <span className="text-[11px] font-medium">Deleting…</span>
                          ) : (
                            <XCircleIcon className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                  {users.length === 0 && (
                    <p className="py-6 text-center text-[12px] text-muted">
                      {loadingAction.kind === "load-users"
                        ? "Loading…"
                        : "No users loaded."}
                    </p>
                  )}
                </div>
                {/* ConfirmModal for user deletion is rendered globally below */}
              </>
            )}
      </Modal>
      <ConfirmModal
        open={openModal === "confirm-delete-user"}
        title="Delete user"
        description="Are you sure you want to delete this user? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={loadingAction.kind === "delete-user"}
        onConfirm={() => void confirmDeleteUser()}
        onCancel={() => cancelDeleteUser()}
      />
      <ConfirmModal
        open={openModal === "confirm-delete-station"}
        title="Delete station"
        description="Are you sure you want to delete this station? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={loadingAction.kind === "delete-station"}
        onConfirm={() => void confirmDeleteStation()}
        onCancel={() => cancelDeleteStation()}
      />
    </>
  );
}
