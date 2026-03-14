"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, useCallback, useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";

import { activeIncidents, queueHealth, responseTargets, serviceStatus } from "@/components/sample-data";
import { OperationsMap } from "@/components/operations-map";
import { StatusCard } from "@/components/status-card";
import { useRealtimeEvents } from "@/hooks/use-realtime-events";
import { dashboardStore, useDashboardStore } from "@/store/dashboard-store";
import type {
  CreateIncidentInput,
  DashboardAppProps,
  DashboardSectionLink,
  DashboardStats,
  Incident,
  LiveState,
  RoleWorkspaceCard,
  SidebarSectionKey,
  Station,
  UserProfile,
  Vehicle,
  WorkspaceView,
} from "@/types/frontend";
import {
  createIncident,
  getAnalyticsDashboard,
  getOpenIncidents,
  getProfile,
  getResponseTimes,
  getStations,
  getVehicles,
  login,
  refreshTokens,
  updateIncidentStatus,
  updateVehicleLocation,
  updateVehicleStatus,
} from "@/lib/api";

const ACCESS_TOKEN_KEY = "eds_access_token";
const REFRESH_TOKEN_KEY = "eds_refresh_token";
const EXPIRES_AT_KEY = "eds_access_expires_at";

type PreviewIncident = (typeof activeIncidents)[number];

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function ensureNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function ensureString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeIncident(value: unknown): Incident | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = ensureString(record.id);
  const citizenName = ensureString(record.citizen_name);
  const incidentType = ensureString(record.incident_type);
  const status = ensureString(record.status, "created");

  if (!id || !citizenName || !incidentType) {
    return null;
  }

  return {
    id,
    citizen_name: citizenName,
    citizen_phone: ensureString(record.citizen_phone) || undefined,
    incident_type: incidentType,
    latitude: ensureNumber(record.latitude),
    longitude: ensureNumber(record.longitude),
    notes: ensureString(record.notes) || undefined,
    assigned_unit_id: ensureString(record.assigned_unit_id) || undefined,
    assigned_unit_type: ensureString(record.assigned_unit_type) || undefined,
    status,
    dispatched_at: ensureString(record.dispatched_at) || undefined,
    resolved_at: ensureString(record.resolved_at) || undefined,
    created_at: ensureString(record.created_at) || undefined,
    updated_at: ensureString(record.updated_at) || undefined,
  };
}

function normalizeVehicle(value: unknown): Vehicle | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = ensureString(record.id);
  if (!id) {
    return null;
  }

  return {
    id,
    station_id: ensureString(record.station_id),
    station_type: ensureString(record.station_type, "unknown"),
    vehicle_type: ensureString(record.vehicle_type, "unknown"),
    license_plate: ensureString(record.license_plate) || undefined,
    driver_name: ensureString(record.driver_name) || undefined,
    status: ensureString(record.status, "available"),
    latitude: ensureNumber(record.latitude),
    longitude: ensureNumber(record.longitude),
    incident_id: ensureString(record.incident_id) || undefined,
    created_at: ensureString(record.created_at) || undefined,
    updated_at: ensureString(record.updated_at) || undefined,
  };
}

function normalizeDashboardStats(value: unknown): DashboardStats | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    total_incidents: ensureNumber(record.total_incidents),
    avg_response_time_seconds: ensureNumber(record.avg_response_time_seconds),
    incidents_by_type: ensureArray<Record<string, unknown>>(record.incidents_by_type)
      .map((item) => ({
        incident_type: ensureString(item.incident_type, "unknown"),
        count: ensureNumber(item.count),
      }))
      .filter((item) => Boolean(item.incident_type)),
  };
}

function normalizeStation(value: unknown): Station | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = ensureString(record.id);
  const name = ensureString(record.name);
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    type: ensureString(record.type, "unknown"),
    latitude: ensureNumber(record.latitude),
    longitude: ensureNumber(record.longitude),
    is_available: typeof record.is_available === "boolean" ? record.is_available : true,
    total_capacity: ensureNumber(record.total_capacity),
    available_capacity: ensureNumber(record.available_capacity),
    contact_phone: ensureString(record.contact_phone) || undefined,
    created_at: ensureString(record.created_at) || undefined,
    updated_at: ensureString(record.updated_at) || undefined,
  };
}

function workspacePath(workspace: WorkspaceView) {
  switch (workspace) {
    case "admin":
      return "/admin";
    case "operations":
      return "/operations";
    case "driver":
      return "/driver";
    default:
      return "/";
  }
}

function allowedWorkspaces(role?: string | null): WorkspaceView[] {
  switch (role) {
    case "system_admin":
      return ["admin"];
    case "hospital_admin":
    case "police_admin":
    case "fire_admin":
      return ["operations"];
    case "ambulance_driver":
      return ["driver"];
    default:
      return ["home"];
  }
}

function defaultWorkspace(role?: string | null): WorkspaceView {
  switch (role) {
    case "system_admin":
      return "admin";
    case "hospital_admin":
    case "police_admin":
    case "fire_admin":
      return "operations";
    case "ambulance_driver":
      return "driver";
    default:
      return "home";
  }
}

function workspaceLabel(workspace: WorkspaceView) {
  switch (workspace) {
    case "admin":
      return "Admin";
    case "operations":
      return "Operations";
    case "driver":
      return "Driver";
    default:
      return "Overview";
  }
}

function normalizeResponseTimes(value: unknown) {
  return ensureArray<Record<string, unknown>>(value)
    .map((item) => ({
      incident_type: ensureString(item.incident_type, "unknown"),
      avg_seconds: ensureNumber(item.avg_seconds),
      min_seconds: ensureNumber(item.min_seconds),
      max_seconds: ensureNumber(item.max_seconds),
      count: ensureNumber(item.count),
    }))
    .filter((item) => Boolean(item.incident_type));
}

function getRoleWorkspace(
  profile: UserProfile | null,
  incidents: Incident[],
  vehicles: Vehicle[],
  dashboard: DashboardStats | null,
): {
  heading: string;
  description: string;
  cards: RoleWorkspaceCard[];
} {
  const incidentCount = incidents.length;
  const vehicleCount = vehicles.length;

  switch (profile?.role) {
    case "system_admin":
      return {
        heading: "Administrative workspace",
        description: "Run the platform from one app, but expose system controls only to platform administrators.",
        cards: [
          {
            title: "Identity and access",
            detail: "Manage admin accounts, role assignments, and service-to-service authentication boundaries.",
            badge: "System",
            tone: "accent" as const,
          },
          {
            title: "Service reliability",
            detail: `${vehicleCount} vehicle records and ${incidentCount} active incidents are currently flowing through the platform.`,
            badge: "Health",
            tone: "signal" as const,
          },
          {
            title: "Analytics oversight",
            detail: `Average response time is ${formatSeconds(dashboard?.avg_response_time_seconds ?? 0)} across tracked dispatches.`,
            badge: "Reporting",
            tone: "warning" as const,
          },
        ],
      };
    case "hospital_admin":
    case "police_admin":
    case "fire_admin":
      return {
        heading: "Station operations workspace",
        description: "Department administrators stay in the same app, but focus on coverage, fleet readiness, and incident load for their station type.",
        cards: [
          {
            title: "Coverage pressure",
            detail: `${incidentCount} open incidents currently need active monitoring or reassignment decisions.`,
            badge: "Incidents",
            tone: "accent" as const,
          },
          {
            title: "Fleet readiness",
            detail: `${vehicleCount} tracked vehicles are available for allocation, movement, or maintenance review.`,
            badge: "Fleet",
            tone: "signal" as const,
          },
          {
            title: "Response performance",
            detail: `Use the live board and analytics panels to rebalance crews when response time drifts above ${formatSeconds(dashboard?.avg_response_time_seconds ?? 0)}.`,
            badge: "Target",
            tone: "warning" as const,
          },
        ],
      };
    case "ambulance_driver":
      return {
        heading: "Responder workspace",
        description: "Drivers and field responders use the same app with a narrower operational view centered on assignments and current position.",
        cards: [
          {
            title: "Active assignments",
            detail: incidentCount > 0
              ? "Track the newest dispatched incident, confirm arrival, and keep status changes flowing back to operations."
              : "No active assignments are visible yet. Keep the gateway open for the next dispatch event.",
            badge: "Dispatch",
            tone: "accent" as const,
          },
          {
            title: "Location visibility",
            detail: "The operations map and vehicle panel stay in sync so dispatchers can see your current route and availability.",
            badge: "Tracking",
            tone: "signal" as const,
          },
          {
            title: "Escalation path",
            detail: "When scene conditions change, update vehicle status immediately so station admins can reroute backup units.",
            badge: "Field ops",
            tone: "warning" as const,
          },
        ],
      };
    default:
      return {
        heading: "Operations workspace",
        description: "One dashboard serves every role, with data and actions narrowed by the authenticated operator profile.",
        cards: [
          {
            title: "Incident command",
            detail: `${incidentCount} incidents are visible in the live board for review and dispatch follow-through.`,
            badge: "Live",
            tone: "accent" as const,
          },
          {
            title: "Fleet posture",
            detail: `${vehicleCount} vehicles are currently visible through the dispatch service.`,
            badge: "Fleet",
            tone: "signal" as const,
          },
          {
            title: "Unified operations",
            detail: "Separate apps are unnecessary here; the correct boundary is role-aware views and permissions inside one frontend.",
            badge: "Architecture",
            tone: "warning" as const,
          },
        ],
      };
  }
}

function formatSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "No data";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isLiveIncident(incident: Incident | PreviewIncident): incident is Incident {
  return "incident_type" in incident;
}

function getIncidentLabel(incident: Incident | PreviewIncident) {
  return isLiveIncident(incident) ? titleCase(incident.incident_type) : incident.type;
}

function getIncidentTitle(incident: Incident | PreviewIncident) {
  return isLiveIncident(incident) ? incident.citizen_name : incident.title;
}

function getIncidentDescription(incident: Incident | PreviewIncident) {
  return isLiveIncident(incident) ? incident.notes || "No incident notes available yet." : incident.description;
}

function getAssignedUnit(incident: Incident | PreviewIncident) {
  return isLiveIncident(incident)
    ? incident.assigned_unit_type
      ? titleCase(incident.assigned_unit_type)
      : "Pending dispatch"
    : incident.unit;
}

function getIncidentStatus(incident: Incident | PreviewIncident) {
  return isLiveIncident(incident) ? titleCase(incident.status) : "Active";
}

function summarizeRealtimePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "Event received";
  }

  const envelope = payload as Record<string, unknown>;
  const record = (typeof envelope.data === "object" && envelope.data !== null
    ? envelope.data
    : envelope) as Record<string, unknown>;
  const identifiers = [record.incident_id, record.vehicle_id, record.id].filter((value) => typeof value === "string");
  const status = typeof record.status === "string" ? titleCase(record.status) : null;
  const incidentType = typeof record.incident_type === "string" ? titleCase(record.incident_type) : null;

  return [incidentType, status, identifiers[0]].filter(Boolean).join(" | ") || "Event received";
}

function mergeIncidentRecord(current: Incident[], incoming: Incident) {
  const next = current.filter((incident) => incident.id !== incoming.id);
  return [incoming, ...next];
}

function extractEnvelopeData(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const envelope = payload as Record<string, unknown>;
  if (typeof envelope.data === "object" && envelope.data !== null) {
    return envelope.data as Record<string, unknown>;
  }

  return envelope;
}

function CommandIcon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "overview":
      return <svg viewBox="0 0 24 24" className={className} {...{}}><path {...common} d="M4 5h7v6H4zM13 5h7v4h-7zM13 11h7v8h-7zM4 13h7v6H4z" /></svg>;
    case "admin":
      return <svg viewBox="0 0 24 24" className={className}><path {...common} d="M12 3l7 4v5c0 5-3.2 7.8-7 9-3.8-1.2-7-4-7-9V7l7-4z" /><path {...common} d="M9.5 12.5l1.6 1.6 3.4-3.6" /></svg>;
    case "operations":
      return <svg viewBox="0 0 24 24" className={className}><path {...common} d="M12 21s6-4.35 6-10a6 6 0 10-12 0c0 5.65 6 10 6 10z" /><circle {...common} cx="12" cy="11" r="2.4" /></svg>;
    case "driver":
      return <svg viewBox="0 0 24 24" className={className}><path {...common} d="M5 14l1.2-4.3A2 2 0 018.1 8h7.8a2 2 0 011.9 1.7L19 14" /><path {...common} d="M4 14h16v4H4z" /><circle {...common} cx="7.5" cy="18" r="1.5" /><circle {...common} cx="16.5" cy="18" r="1.5" /></svg>;
    case "search":
      return <svg viewBox="0 0 24 24" className={className}><circle {...common} cx="11" cy="11" r="6.5" /><path {...common} d="M20 20l-3.5-3.5" /></svg>;
    case "moon":
      return <svg viewBox="0 0 24 24" className={className}><path {...common} d="M19 14.7A7.5 7.5 0 119.3 5a6.3 6.3 0 009.7 9.7z" /></svg>;
    case "sun":
      return <svg viewBox="0 0 24 24" className={className}><circle {...common} cx="12" cy="12" r="4" /><path {...common} d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.5 1.5M6.8 17.2l-1.5 1.5M18.7 18.7l-1.5-1.5M6.8 6.8L5.3 5.3" /></svg>;
    case "chevron":
      return <svg viewBox="0 0 24 24" className={className}><path {...common} d="M9 6l6 6-6 6" /></svg>;
    case "bolt":
      return <svg viewBox="0 0 24 24" className={className}><path {...common} d="M13 2L6 13h5l-1 9 8-12h-5l0-8z" /></svg>;
    case "map":
      return <svg viewBox="0 0 24 24" className={className}><path {...common} d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><path {...common} d="M9 4v14" /><path {...common} d="M15 6v14" /></svg>;
    case "incident":
      return <svg viewBox="0 0 24 24" className={className}><path {...common} d="M12 3l9 16H3z" /><path {...common} d="M12 9v4" /><path {...common} d="M12 17h.01" /></svg>;
    case "form":
      return <svg viewBox="0 0 24 24" className={className}><path {...common} d="M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" /><path {...common} d="M8 9h8M8 13h8M8 17h5" /></svg>;
    case "vehicle":
      return <svg viewBox="0 0 24 24" className={className}><path {...common} d="M5 14l1.2-4.3A2 2 0 018.1 8h7.8a2 2 0 011.9 1.7L19 14" /><path {...common} d="M4 14h16v4H4z" /><circle {...common} cx="7.5" cy="18" r="1.5" /><circle {...common} cx="16.5" cy="18" r="1.5" /></svg>;
    case "activity":
      return <svg viewBox="0 0 24 24" className={className}><path {...common} d="M4 12h4l2.5-5 3 10 2-5H20" /></svg>;
    case "bell":
      return <svg viewBox="0 0 24 24" className={className}><path {...common} d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path {...common} d="M13.73 21a2 2 0 01-3.46 0" /></svg>;
    default:
      return <svg viewBox="0 0 24 24" className={className}><circle {...common} cx="12" cy="12" r="8" /></svg>;
  }
}

function workspaceIconName(workspace: WorkspaceView) {
  switch (workspace) {
    case "admin":
      return "admin";
    case "operations":
      return "operations";
    case "driver":
      return "driver";
    default:
      return "overview";
  }
}

export function DashboardApp({ workspace = "home", section }: DashboardAppProps) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    email,
    password,
    token,
    state,
    authError,
    dataError,
    actionError,
    actionNotice,
    loadingAction,
    isBootstrapping,
    theme,
    commandQuery,
    sidebarSections,
    activeSectionID,
    incidentForm,
    selectedVehicleID,
    vehicleStatus,
    vehicleLatitude,
    vehicleLongitude,
  } = useDashboardStore();
  const [, startTransition] = useTransition();
  const setStore = dashboardStore.setState;
  const { events: realtimeEvents, status: realtimeStatus } = useRealtimeEvents(token);
  const deferredCommandQuery = useDeferredValue(commandQuery.trim().toLowerCase());
  const safeResponseTimes = ensureArray<LiveState["responseTimes"][number]>(state.responseTimes);
  const safeIncidents = ensureArray<Incident>(state.incidents);
  const safeVehicles = ensureArray<Vehicle>(state.vehicles);
  const safeStations = ensureArray<Station>(state.stations);
  const safeRealtimeEvents = ensureArray<typeof realtimeEvents[number]>(realtimeEvents);

  const liveResponseCards = useMemo(() => {
    if (safeResponseTimes.length === 0) {
      return responseTargets;
    }

    return safeResponseTimes.slice(0, 3).map((item, index) => ({
      label: titleCase(item.incident_type),
      value: formatSeconds(item.avg_seconds),
      detail: `${item.count} recorded dispatches. Fastest ${formatSeconds(item.min_seconds)}.`,
      tone: (["signal", "warning", "danger"] as const)[index] ?? "signal",
    }));
  }, [safeResponseTimes]);

  const liveQueueHealth = useMemo(() => {
    if (!state.dashboard) {
      return queueHealth;
    }

    return [
      {
        label: "Tracked incidents",
        value: `${state.dashboard.total_incidents}`,
        detail: "Derived analytics rows currently available for reporting.",
      },
      {
        label: "Average response time",
        value: formatSeconds(state.dashboard.avg_response_time_seconds),
        detail: "Computed from incident dispatch and responder arrival timings.",
      },
      {
        label: "Active vehicle records",
        value: `${safeVehicles.length}`,
        detail: "Vehicles currently visible through the dispatch tracking service.",
      },
    ];
  }, [safeVehicles.length, state.dashboard]);

  const incidentsToShow: Array<Incident | PreviewIncident> =
    safeIncidents.length > 0 ? safeIncidents : activeIncidents;
  const latestRealtimeEvent = safeRealtimeEvents[0] ?? null;
  const roleWorkspace = getRoleWorkspace(state.profile, safeIncidents, safeVehicles, state.dashboard);
  const workspaceLinks = allowedWorkspaces(state.profile?.role).map((item) => ({
    key: item,
    href: workspacePath(item),
    label: workspaceLabel(item),
    icon: workspaceIconName(item),
  }));
  const canManageIncidents = state.profile?.role !== "ambulance_driver";
  const canControlVehicles = Boolean(state.profile);
  const workspaceBasePath = workspace === "home" ? "" : `/${workspace}`;

  const mapPoints = useMemo(() => {
    const incidentPoints = incidentsToShow
      .map((incident) => {
        const latitude = isLiveIncident(incident) ? incident.latitude : incident.latitude;
        const longitude = isLiveIncident(incident) ? incident.longitude : incident.longitude;
        if (typeof latitude !== "number" || typeof longitude !== "number") {
          return null;
        }

        return {
          id: incident.id,
          label: getIncidentTitle(incident),
          detail: `${getIncidentLabel(incident)} | ${getIncidentStatus(incident)}`,
          latitude,
          longitude,
          tone: "incident" as const,
        };
      })
      .filter((point): point is NonNullable<typeof point> => point !== null);

    const vehiclePoints = safeVehicles.map((vehicle) => ({
      id: vehicle.id,
      label: vehicle.license_plate || vehicle.id.slice(0, 8),
      detail: `${titleCase(vehicle.vehicle_type)} | ${titleCase(vehicle.status)}`,
      latitude: vehicle.latitude,
      longitude: vehicle.longitude,
      tone: "vehicle" as const,
    }));

    return [...incidentPoints, ...vehiclePoints];
  }, [incidentsToShow, safeVehicles]);

  const filteredIncidents = useMemo(() => {
    if (!deferredCommandQuery) {
      return incidentsToShow;
    }

    return incidentsToShow.filter((incident) => {
      const haystack = [
        incident.id,
        getIncidentTitle(incident),
        getIncidentLabel(incident),
        getIncidentDescription(incident),
        getIncidentStatus(incident),
      ].join(" ").toLowerCase();
      return haystack.includes(deferredCommandQuery);
    });
  }, [deferredCommandQuery, incidentsToShow]);

  const filteredVehicles = useMemo(() => {
    if (!deferredCommandQuery) {
      return safeVehicles;
    }

    return safeVehicles.filter((vehicle) => {
      const haystack = [
        vehicle.id,
        vehicle.license_plate,
        vehicle.driver_name,
        vehicle.station_type,
        vehicle.vehicle_type,
        vehicle.status,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(deferredCommandQuery);
    });
  }, [deferredCommandQuery, safeVehicles]);

  const filteredRealtimeEvents = useMemo(() => {
    if (!deferredCommandQuery) {
      return safeRealtimeEvents;
    }

    return safeRealtimeEvents.filter((event) => {
      const haystack = `${event.type} ${summarizeRealtimePayload(event.payload)}`.toLowerCase();
      return haystack.includes(deferredCommandQuery);
    });
  }, [deferredCommandQuery, safeRealtimeEvents]);

  const signedIn = Boolean(token && state.profile);
  const [openModal, setOpenModal] = useState<"incident-intake" | "vehicle-command" | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const dashboardSectionLinks = useMemo<DashboardSectionLink[]>(() => {
    if (!signedIn) {
      return [
        { id: "preview-board", label: "Preview Board", icon: "overview" },
        { id: "preview-health", label: "Service Health", icon: "activity" },
      ];
    }

    return [
      { id: "overview", label: "Overview", icon: "overview" },
      { id: "realtime-feed", label: "Realtime Feed", icon: "activity" },
    ];
  }, [signedIn]);
  const selectedVehicle = filteredVehicles.find((vehicle) => vehicle.id === selectedVehicleID)
    ?? safeVehicles.find((vehicle) => vehicle.id === selectedVehicleID)
    ?? null;
  const isLoggingIn = loadingAction.kind === "login";
  const isRefreshingWorkspace = loadingAction.kind === "refresh";
  const isCreatingIncident = loadingAction.kind === "create-incident";
  const isUpdatingVehicleStatus = loadingAction.kind === "vehicle-status" && loadingAction.vehicleID === selectedVehicleID;
  const isUpdatingVehicleLocation = loadingAction.kind === "vehicle-location" && loadingAction.vehicleID === selectedVehicleID;
  const availableStations = safeStations.filter((station) => station.is_available).length;
  const availableVehicles = safeVehicles.filter((vehicle) => vehicle.status === "available").length;
  const workspaceTitle = workspace === "admin"
    ? "System Console"
    : workspace === "driver"
      ? "Responder View"
      : workspace === "operations"
        ? "Operations Center"
        : "Dispatch Overview";
  const selectedSectionID = useMemo(() => {
    switch (section) {
      case "realtime":
        return "realtime-feed";
      default:
        return "overview";
    }
  }, [section]);
  const effectiveSectionID = selectedSectionID ?? activeSectionID ?? dashboardSectionLinks[0]?.id;
  const shouldRenderSection = useCallback(
    (sectionID: string) => effectiveSectionID === sectionID,
    [effectiveSectionID],
  );

  function storeTokens(accessToken: string, refreshToken: string, expiresIn: number) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    window.localStorage.setItem(EXPIRES_AT_KEY, `${Date.now() + expiresIn * 1000}`);
  }

  const refreshSession = useCallback(async (refreshTokenValue: string) => {
    const refreshed = await refreshTokens(refreshTokenValue);
    storeTokens(refreshed.access_token, refreshed.refresh_token, refreshed.expires_in);
    setStore({ token: refreshed.access_token });
    return refreshed.access_token;
  }, [setStore]);

  const toggleSidebarSection = useCallback((key: SidebarSectionKey) => {
    setStore((current) => ({
      sidebarSections: { ...current.sidebarSections, [key]: !current.sidebarSections[key] },
    }));
  }, [setStore]);

  function isIncidentStatusLoading(incidentID: string, status: string) {
    return loadingAction.kind === "incident-status"
      && loadingAction.incidentID === incidentID
      && loadingAction.status === status;
  }

  const loadDashboard = useCallback(async (accessToken: string, allowRefresh = true) => {
    setStore({ dataError: null });

    try {
      const [profileResult, incidentsResult, vehiclesResult, stationsResult, dashboardResult, responseTimesResult] = await Promise.allSettled([
        getProfile(accessToken),
        getOpenIncidents(accessToken),
        getVehicles(accessToken),
        getStations(accessToken),
        getAnalyticsDashboard(accessToken),
        getResponseTimes(accessToken),
      ]);

      if (profileResult.status === "rejected") {
        throw profileResult.reason;
      }

      setStore({
        state: {
          profile: profileResult.value,
          incidents: incidentsResult.status === "fulfilled" ? ensureArray<unknown>(incidentsResult.value).map(normalizeIncident).filter((item): item is Incident => item !== null) : [],
          vehicles: vehiclesResult.status === "fulfilled" ? ensureArray<unknown>(vehiclesResult.value).map(normalizeVehicle).filter((item): item is Vehicle => item !== null) : [],
          stations: stationsResult.status === "fulfilled" ? ensureArray<unknown>(stationsResult.value).map(normalizeStation).filter((item): item is Station => item !== null) : [],
          dashboard: dashboardResult.status === "fulfilled" ? normalizeDashboardStats(dashboardResult.value) : null,
          responseTimes: responseTimesResult.status === "fulfilled" ? normalizeResponseTimes(responseTimesResult.value) : [],
        },
      });

      const failures = [incidentsResult, vehiclesResult, stationsResult, dashboardResult, responseTimesResult].some(
        (result) => result.status === "rejected",
      );

      if (failures) {
        setStore({ dataError: "Some services are reachable but one or more dashboard sections are still unavailable." });
      }

      return profileResult.value;
    } catch (error) {
      if (allowRefresh) {
        const refreshTokenValue = window.localStorage.getItem(REFRESH_TOKEN_KEY);
        if (refreshTokenValue) {
          try {
            const newAccessToken = await refreshSession(refreshTokenValue);
            if (newAccessToken !== accessToken) {
              await loadDashboard(newAccessToken, false);
              return;
            }
          } catch {
            // Fall through to sign-out path below.
          }
        }
      }

      const message = error instanceof Error ? error.message : "Unable to load dashboard";
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
  }, [refreshSession, setStore]);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!storedToken) {
      setStore({ isBootstrapping: false });
      return;
    }

    setStore({ token: storedToken });
    void loadDashboard(storedToken);
  }, [loadDashboard, setStore]);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("eds_theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      setStore({ theme: storedTheme });
    }
  }, [setStore]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("eds_theme", theme);
  }, [theme]);

  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "");
      setStore({ activeSectionID: hash || "top" });
    };

    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => {
      window.removeEventListener("hashchange", applyHash);
    };
  }, [setStore]);

  useEffect(() => {
    if (!selectedSectionID) {
      return;
    }

    setStore({ activeSectionID: selectedSectionID });
  }, [selectedSectionID, setStore]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (visible?.target?.id) {
          setStore({ activeSectionID: visible.target.id });
        }
      },
      { rootMargin: "-15% 0px -65% 0px", threshold: [0.2, 0.45, 0.7] },
    );

    dashboardSectionLinks.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [dashboardSectionLinks, signedIn, setStore]);

  useEffect(() => {
    if (!state.profile) {
      return;
    }

    const allowed = allowedWorkspaces(state.profile.role);
    if (workspace === "home" || !allowed.includes(workspace)) {
      const nextPath = workspacePath(defaultWorkspace(state.profile.role));
      if (pathname !== nextPath) {
        router.replace(nextPath);
      }
    }
  }, [pathname, router, state.profile, workspace]);

  useEffect(() => {
    if (filteredVehicles.length === 0) {
      setStore({ selectedVehicleID: "" });
      return;
    }

    setStore((current) => ({
      selectedVehicleID:
        current.selectedVehicleID && filteredVehicles.some((vehicle) => vehicle.id === current.selectedVehicleID)
          ? current.selectedVehicleID
          : filteredVehicles[0].id,
    }));
  }, [filteredVehicles, setStore]);

  useEffect(() => {
    const selectedVehicle = safeVehicles.find((vehicle) => vehicle.id === selectedVehicleID) ?? safeVehicles[0];
    if (!selectedVehicle) {
      return;
    }

    setStore({
      vehicleStatus: selectedVehicle.status,
      vehicleLatitude: selectedVehicle.latitude.toFixed(4),
      vehicleLongitude: selectedVehicle.longitude.toFixed(4),
    });
  }, [safeVehicles, selectedVehicleID, setStore]);

  const handleSignOut = useCallback(() => {
    dashboardStore.reset();
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    window.localStorage.removeItem(EXPIRES_AT_KEY);
    router.replace("/");
  }, [router]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const interval = window.setInterval(() => {
      const refreshTokenValue = window.localStorage.getItem(REFRESH_TOKEN_KEY);
      const expiresAt = Number(window.localStorage.getItem(EXPIRES_AT_KEY) ?? "0");

      if (!refreshTokenValue || !expiresAt || Date.now() < expiresAt - 60_000) {
        return;
      }

      void (async () => {
        try {
          const newAccessToken = await refreshSession(refreshTokenValue);
          await loadDashboard(newAccessToken, false);
        } catch {
          handleSignOut();
        }
      })();
    }, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [token, loadDashboard, refreshSession, handleSignOut]);

  useEffect(() => {
    if (!latestRealtimeEvent) {
      return;
    }

    const payload = extractEnvelopeData(latestRealtimeEvent.payload);
    if (!payload) {
      return;
    }

    setStore((current) => {
      switch (latestRealtimeEvent.type) {
        case "incident.created": {
          return {
            state: {
              ...current.state,
              incidents: mergeIncidentRecord(current.state.incidents, payload as unknown as Incident),
            },
          };
        }
        case "incident.dispatched":
        case "incident.status_changed": {
          const incidentPayload = typeof payload.incident === "object" && payload.incident !== null
            ? (payload.incident as Incident)
            : null;
          if (!incidentPayload) {
            return current;
          }
          return {
            state: {
              ...current.state,
              incidents: mergeIncidentRecord(current.state.incidents, incidentPayload),
            },
          };
        }
        case "vehicle.location_updated": {
          const vehicleID = typeof payload.vehicle_id === "string" ? payload.vehicle_id : "";
          if (!vehicleID) {
            return current;
          }

          const existing = current.state.vehicles.find((vehicle) => vehicle.id === vehicleID);
          const updatedVehicle: Vehicle = existing
            ? {
                ...existing,
                latitude: typeof payload.latitude === "number" ? payload.latitude : existing.latitude,
                longitude: typeof payload.longitude === "number" ? payload.longitude : existing.longitude,
                status: typeof payload.status === "string" ? payload.status : existing.status,
              }
            : {
                id: vehicleID,
                station_id: "",
                station_type: "unknown",
                vehicle_type: "unknown",
                status: typeof payload.status === "string" ? payload.status : "available",
                latitude: typeof payload.latitude === "number" ? payload.latitude : 0,
                longitude: typeof payload.longitude === "number" ? payload.longitude : 0,
              };

          return {
            state: {
              ...current.state,
              vehicles: [updatedVehicle, ...current.state.vehicles.filter((vehicle) => vehicle.id !== vehicleID)],
            },
          };
        }
        case "vehicle.status_changed": {
          const vehicleID = typeof payload.vehicle_id === "string" ? payload.vehicle_id : "";
          if (!vehicleID) {
            return current;
          }

          return {
            state: {
              ...current.state,
              vehicles: current.state.vehicles.map((vehicle) =>
                vehicle.id === vehicleID && typeof payload.status === "string"
                  ? { ...vehicle, status: payload.status }
                  : vehicle,
              ),
            },
          };
        }
        default:
          return current;
      }
    });
  }, [latestRealtimeEvent, setStore]);

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStore({ authError: null, loadingAction: { kind: "login" } });

    startTransition(() => {
      void (async () => {
        try {
          const tokens = await login(email, password);
          setStore({ token: tokens.access_token });
          storeTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in);
          const profile = await loadDashboard(tokens.access_token);
          router.replace(workspacePath(defaultWorkspace(profile?.role)));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Login failed";
          setStore({ authError: message });
        } finally {
          setStore({ loadingAction: { kind: "idle" } });
        }
      })();
    });
  }

  function handleRefreshWorkspace() {
    if (!token) {
      return;
    }

    setStore({
      actionError: null,
      actionNotice: null,
      loadingAction: { kind: "refresh" },
    });
    startTransition(() => {
      void (async () => {
        try {
          await loadDashboard(token);
          setStore({ actionNotice: "Workspace refreshed." });
        } catch (error) {
          setStore({ actionError: error instanceof Error ? error.message : "Unable to refresh workspace" });
        } finally {
          setStore({ loadingAction: { kind: "idle" } });
        }
      })();
    });
  }

  function handleIncidentFieldChange<K extends keyof CreateIncidentInput>(field: K, value: CreateIncidentInput[K]) {
    setStore((current) => ({
      incidentForm: { ...current.incidentForm, [field]: value },
    }));
  }

  function handleCreateIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setStore({
      actionError: null,
      actionNotice: null,
      loadingAction: { kind: "create-incident" },
    });
    startTransition(() => {
      void (async () => {
        try {
          const created = await createIncident(token, {
            ...incidentForm,
            citizen_phone: incidentForm.citizen_phone || undefined,
            notes: incidentForm.notes || undefined,
          });
          const normalized = normalizeIncident(created.incident);
          if (normalized) {
            setStore((current) => ({
              state: {
                ...current.state,
                incidents: mergeIncidentRecord(current.state.incidents, normalized),
              },
            }));
          }
          setStore({
            incidentForm: {
              citizen_name: "",
              citizen_phone: "",
              incident_type: incidentForm.incident_type,
              latitude: incidentForm.latitude,
              longitude: incidentForm.longitude,
              notes: "",
            },
            actionNotice: created.dispatch_warning ?? "Incident created and queued for dispatch.",
          });
        } catch (error) {
          setStore({ actionError: error instanceof Error ? error.message : "Unable to create incident" });
        } finally {
          setStore({ loadingAction: { kind: "idle" } });
        }
      })();
    });
  }

  function handleIncidentStatusChange(incidentID: string, status: string) {
    if (!token) {
      return;
    }

    setStore({
      actionError: null,
      actionNotice: null,
      loadingAction: { kind: "incident-status", incidentID, status },
    });
    startTransition(() => {
      void (async () => {
        try {
          const updated = normalizeIncident(await updateIncidentStatus(token, incidentID, status));
          if (updated) {
            setStore((current) => ({
              state: {
                ...current.state,
                incidents: mergeIncidentRecord(current.state.incidents, updated),
              },
            }));
          }
          setStore({ actionNotice: `Incident moved to ${titleCase(status)}.` });
        } catch (error) {
          setStore({ actionError: error instanceof Error ? error.message : "Unable to update incident status" });
        } finally {
          setStore({ loadingAction: { kind: "idle" } });
        }
      })();
    });
  }

  function handleVehicleStatusSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedVehicleID) {
      return;
    }

    setStore({
      actionError: null,
      actionNotice: null,
      loadingAction: { kind: "vehicle-status", vehicleID: selectedVehicleID },
    });
    startTransition(() => {
      void (async () => {
        try {
          const updated = normalizeVehicle(await updateVehicleStatus(token, selectedVehicleID, vehicleStatus));
          if (updated) {
            setStore((current) => ({
              state: {
                ...current.state,
                vehicles: [updated, ...current.state.vehicles.filter((vehicle) => vehicle.id !== updated.id)],
              },
            }));
          }
          setStore({ actionNotice: `Vehicle status changed to ${titleCase(vehicleStatus)}.` });
        } catch (error) {
          setStore({ actionError: error instanceof Error ? error.message : "Unable to update vehicle status" });
        } finally {
          setStore({ loadingAction: { kind: "idle" } });
        }
      })();
    });
  }

  function handleVehicleLocationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedVehicleID) {
      return;
    }

    const latitude = Number(vehicleLatitude);
    const longitude = Number(vehicleLongitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setStore({ actionError: "Latitude and longitude must be valid numbers." });
      return;
    }

    setStore({
      actionError: null,
      actionNotice: null,
      loadingAction: { kind: "vehicle-location", vehicleID: selectedVehicleID },
    });
    startTransition(() => {
      void (async () => {
        try {
          await updateVehicleLocation(token, selectedVehicleID, latitude, longitude);
          setStore((current) => ({
            state: {
              ...current.state,
              vehicles: current.state.vehicles.map((vehicle) =>
                vehicle.id === selectedVehicleID ? { ...vehicle, latitude, longitude } : vehicle,
              ),
            },
          }));
          setStore({ actionNotice: "Vehicle location updated." });
        } catch (error) {
          setStore({ actionError: error instanceof Error ? error.message : "Unable to update vehicle location" });
        } finally {
          setStore({ loadingAction: { kind: "idle" } });
        }
      })();
    });
  }

  function handleSectionNavigation(target: DashboardSectionLink) {
    const sectionID = target.id;
    window.history.replaceState(null, "", `#${sectionID}`);
    setStore({ activeSectionID: sectionID });
  }

  return (
    <>
    <main className="min-h-screen bg-background text-foreground">
      <div id="top" className="grid min-h-screen lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="sidebar-surface flex min-h-screen flex-col px-3 py-3">
          {/* Branding */}
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
              <CommandIcon name="bolt" className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-foreground">{workspaceTitle}</p>
              <p className="text-[11px] text-muted">Emergency Dispatch</p>
            </div>
          </div>

          {/* Search */}
          <label className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-white/4 px-2.5 py-[7px] text-[13px] text-muted">
            <CommandIcon name="search" className="h-3.5 w-3.5 text-muted" />
            <input
              value={commandQuery}
              onChange={(event) => setStore({ commandQuery: event.target.value })}
              placeholder="Search…"
              className="w-full bg-transparent text-foreground outline-none placeholder:text-muted text-[13px]"
            />
          </label>

          {/* Workspace nav */}
          <div className="mt-4 px-2">
            <p className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">Workspace</p>
            <nav className="space-y-0.5">
              {(signedIn ? workspaceLinks : [{ key: "home", href: "/", label: "Overview", icon: "overview" }]).map((link) => {
                const active = pathname === link.href;
                return (
                  <Link key={link.key} href={link.href} className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium transition ${active ? "bg-accent/15 text-accent" : "text-foreground/80 hover:bg-white/5 hover:text-foreground"}`}>
                    <CommandIcon name={link.icon} className="h-4 w-4" /> {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="mt-6 px-2">
            <p className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">System status</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white/5 p-2 border border-line">
                <span className="text-[11px] text-muted block mb-0.5">Incidents</span>
                <span className="text-[14px] font-semibold">{filteredIncidents.length}</span>
              </div>
              <div className="rounded-lg bg-white/5 p-2 border border-line">
                <span className="text-[11px] text-muted block mb-0.5">Fleet</span>
                <span className="text-[14px] font-semibold">{availableVehicles}</span>
              </div>
            </div>
            {signedIn && (
              <div className="mt-2 text-[11px] text-muted px-1 flex flex-col gap-1.5">
                <div className="flex justify-between items-center bg-white/5 px-2 py-1.5 rounded border border-line">
                  <span>API gateway</span>
                  <span className="w-2 h-2 rounded-full bg-signal shadow-[0_0_8px_rgba(var(--signal),0.6)]"></span>
                </div>
                <div className="flex justify-between items-center bg-white/5 px-2 py-1.5 rounded border border-line">
                  <span>Realtime broker</span>
                  <span className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(var(--signal),0.6)] ${realtimeStatus === "connected" ? "bg-signal" : "bg-warning"}`}></span>
                </div>
              </div>
            )}
          </div>

          {/* Profile / Login */}
          <div className="mt-auto border-t border-line pt-3">
            {signedIn ? (
              <div className="space-y-3 px-1">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/16 text-[13px] font-semibold text-accent">
                    {(state.profile?.name ?? "U")[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-foreground">{state.profile?.name}</p>
                    <p className="truncate text-[11px] text-muted">{titleCase(state.profile?.role ?? "guest")}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleRefreshWorkspace}
                    disabled={isRefreshingWorkspace}
                    className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {isRefreshingWorkspace ? "Refreshing…" : "Refresh"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-muted transition hover:text-foreground hover:bg-white/4"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            ) : (
              <form className="space-y-2.5 px-1" onSubmit={handleLogin}>
                <p className="text-[11px] font-medium text-muted">Sign in to connect</p>
                <div className="rounded-lg border border-accent/20 bg-accent/8 px-2.5 py-2 text-[11px] leading-4 text-foreground/80">
                  <span className="font-medium">system_admin@dispatch.local</span> / <span className="font-medium">dispatch1234</span>
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setStore({ email: event.target.value })}
                  className="w-full rounded-lg border border-line bg-white/4 px-2.5 py-[7px] text-[13px] text-foreground outline-none focus:border-accent"
                  placeholder="Email"
                  required
                />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setStore({ password: event.target.value })}
                  className="w-full rounded-lg border border-line bg-white/4 px-2.5 py-[7px] text-[13px] text-foreground outline-none focus:border-accent"
                  placeholder="Password"
                  required
                />
                {authError ? <p className="rounded-lg bg-danger/10 px-2.5 py-1.5 text-[12px] text-danger">{authError}</p> : null}
                <button
                  type="submit"
                  disabled={isLoggingIn || isBootstrapping}
                  className="w-full rounded-lg bg-accent px-3 py-[7px] text-[12px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {isLoggingIn || isBootstrapping ? "Signing in…" : "Sign in"}
                </button>
              </form>
            )}
          </div>
        </aside>

        <div className="flex flex-col min-w-0 flex-1">
          <header className="sticky top-0 z-40 border-b border-line bg-background/90 px-5 pt-4 pb-3 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-[15px] font-semibold text-foreground">{workspaceTitle}</h2>
                <span className="text-[13px] text-muted">›</span>
                <span className="text-[13px] text-muted">{roleWorkspace.heading}</span>
              </div>
              <div className="flex items-center gap-3">
                {signedIn && canManageIncidents && (
                  <button
                    type="button"
                    onClick={() => setOpenModal("incident-intake")}
                    className="flex items-center gap-2 rounded-lg border border-accent/20 bg-accent/10 px-3 py-1.5 text-[12px] font-medium text-accent transition hover:bg-accent hover:text-white"
                  >
                    <span className="text-[14px] leading-none">+</span> New Incident
                  </button>
                )}
                {signedIn && canControlVehicles && (
                  <button
                    type="button"
                    onClick={() => setOpenModal("vehicle-command")}
                    className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-foreground transition hover:bg-nav-hover"
                  >
                    <CommandIcon name="vehicle" className="h-3.5 w-3.5" /> Manage Fleet
                  </button>
                )}
                <div className="h-6 w-px bg-line/60 hidden sm:block"></div>
                
                {/* Notification Bell */}
                {signedIn && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setBellOpen(!bellOpen)}
                      className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition hover:text-foreground hover:bg-nav-hover"
                    >
                      <CommandIcon name="bell" className="h-[18px] w-[18px]" />
                      {safeRealtimeEvents.length > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[8px] font-bold text-white shadow-[0_0_0_2px_var(--background)]">
                          {Math.min(safeRealtimeEvents.length, 9)}
                        </span>
                      )}
                    </button>
                    {bellOpen && (
                      <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-panel p-2 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center justify-between px-3 pb-2 pt-1">
                          <h4 className="text-[13px] font-semibold text-foreground">Recent Alerts</h4>
                          <span className="text-[11px] text-muted">{safeRealtimeEvents.length} total</span>
                        </div>
                        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                          {safeRealtimeEvents.slice(0, 5).map((event) => (
                            <div key={`${event.type}-${event.receivedAt}-bell`} className="flex flex-col gap-1 rounded-lg p-3 transition hover:bg-white/5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">{event.type.replace(/\./g, " ")}</span>
                                <span className="text-[10px] text-muted">{new Date(event.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              <p className="text-[12px] text-foreground/90">{summarizeRealtimePayload(event.payload)}</p>
                            </div>
                          ))}
                          {safeRealtimeEvents.length === 0 && (
                            <div className="px-3 py-6 text-center text-[12px] text-muted">
                              No recent alerts
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                <button
                  type="button"
                  onClick={() => setStore((current) => ({ theme: current.theme === "dark" ? "light" : "dark" }))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition hover:text-foreground hover:bg-nav-hover"
                >
                  <CommandIcon name={theme === "dark" ? "sun" : "moon"} className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* Figma-style filter chips */}
            <div className="mt-3 flex flex-wrap gap-2">
              {dashboardSectionLinks.map((section) => {
                const active = (selectedSectionID ?? activeSectionID) === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => handleSectionNavigation(section)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
                      active
                        ? "border-accent/30 bg-accent/10 text-accent"
                        : "border-line bg-transparent text-muted hover:border-line-strong hover:text-foreground"
                    }`}
                  >
                    <CommandIcon name={section.icon} className="h-3.5 w-3.5" />
                    {section.label}
                  </button>
                );
              })}
            </div>
          </header>



          {actionError ? <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{actionError}</p> : null}
          {actionNotice ? <p className="mt-3 rounded-lg bg-signal/10 px-3 py-2 text-[13px] text-signal">{actionNotice}</p> : null}
          {dataError ? <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-[13px] text-warning">{dataError}</p> : null}

          {!signedIn ? (
            <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <section id="preview-board" className="panel scroll-mt-28 rounded-xl p-6">
                <p className="text-[11px] font-medium uppercase tracking-wide text-accent">Preview board</p>
                <h3 className="mt-2 text-xl font-semibold text-foreground">Dispatch operations dashboard</h3>
                <p className="mt-2 max-w-2xl text-[13px] leading-5 text-muted">
                  Sidebar navigation, persistent system context, and a unified working surface for admin, operations, and driver roles.
                </p>
                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  {liveResponseCards.map((item) => (
                    <StatusCard key={item.label} label={item.label} value={item.value} detail={item.detail} tone={item.tone} />
                  ))}
                </div>
                <div className="mt-4 rounded-xl border border-line p-3">
                  <OperationsMap points={mapPoints} className="h-[22rem] overflow-hidden rounded-lg border border-line" />
                </div>
              </section>

              <section id="preview-health" className="panel scroll-mt-28 rounded-xl p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted">Service health</p>
                <div className="mt-5 space-y-3">
                  {liveQueueHealth.map((item) => (
                    <div key={item.label} className="panel-strong rounded-lg p-4">
                      <p className="text-sm text-muted">{item.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{item.value}</p>
                      <p className="mt-1 text-sm text-muted">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)]">
              <div className="space-y-6">
                {shouldRenderSection("overview") ? (
                  <div className="grid gap-6">
                    {/* Top Row: Map and Telemetry */}
                    <div className="grid lg:grid-cols-3 gap-6">
                      <div className="lg:col-span-2">
                        <section className="panel rounded-xl p-6 sm:p-8 h-full">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-6">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted">Operations map</p>
                              <h3 className="display-font mt-2 text-2xl font-semibold tracking-tight text-foreground">Incident and fleet spatial view</h3>
                            </div>
                            <div className="chip rounded-lg px-4 py-3 text-sm">{mapPoints.length} markers</div>
                          </div>
                          <div className="rounded-xl border border-line bg-black/10 p-4 h-[24rem]">
                            <OperationsMap points={mapPoints} className="h-full overflow-hidden rounded-lg border border-line" />
                          </div>
                        </section>
                      </div>
                      
                      {/* Telemetry Panel */}
                      <div className="lg:col-span-1 flex flex-col gap-6">
                        <section className="panel rounded-xl p-6 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted mb-4">Service Analytics</p>
                          
                          <div className="space-y-6">
                            <div>
                              <p className="text-[13px] font-medium text-foreground mb-3">Response Times</p>
                              <div className="space-y-3">
                                {safeResponseTimes.slice(0, 3).map((item, i) => {
                                  const maxTarget = 600; // 10 minutes max scale
                                  const width = Math.min(100, (item.avg_seconds / maxTarget) * 100);
                                  const colorClass = i === 0 ? "bg-signal" : i === 1 ? "bg-warning" : "bg-danger";
                                  return (
                                    <div key={item.incident_type} className="space-y-1.5">
                                      <div className="flex justify-between text-[11px]">
                                        <span className="text-muted">{titleCase(item.incident_type)}</span>
                                        <span className="font-semibold">{formatSeconds(item.avg_seconds)}</span>
                                      </div>
                                      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-line">
                                        <div className={`h-full ${colorClass} rounded-full`} style={{ width: `${width}%` }} />
                                      </div>
                                    </div>
                                  );
                                })}
                                {safeResponseTimes.length === 0 && (
                                  <p className="text-[12px] text-muted py-2">No response data available</p>
                                )}
                              </div>
                            </div>
                            
                            {state.dashboard?.incidents_by_type && state.dashboard.incidents_by_type.length > 0 && (
                              <div className="pt-4 border-t border-line">
                                <p className="text-[13px] font-medium text-foreground mb-3">Incident Distribution</p>
                                <div className="space-y-3">
                                  {state.dashboard.incidents_by_type.map((item) => {
                                    const maxCount = Math.max(...state.dashboard!.incidents_by_type.map((i) => i.count));
                                    const width = Math.max(5, (item.count / maxCount) * 100);
                                    return (
                                      <div key={item.incident_type} className="flex items-center gap-3">
                                        <span className="w-16 text-[11px] text-muted truncate">{titleCase(item.incident_type)}</span>
                                        <div className="flex-1 h-5 flex items-center">
                                          <div className="h-full bg-accent/30 border border-accent/50 rounded flex items-center px-2 text-[10px] font-bold text-accent justify-end min-w-[24px]" style={{ width: `${width}%` }}>
                                            {item.count}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </section>
                      </div>
                    </div>

                    {/* Bottom Row: Incident Board */}
                    <section className="panel rounded-xl p-6 sm:p-8">
                      <div className="flex items-center justify-between gap-4 mb-6">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted">Incident board</p>
                          <h3 className="display-font mt-2 text-2xl font-semibold tracking-tight text-foreground">Open responses</h3>
                        </div>
                        <span className="rounded-full bg-danger/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-danger">
                          {incidentsToShow.length} active
                        </span>
                      </div>
                      <div className="mt-2 space-y-4">
                        {filteredIncidents.map((incident) => (
                          <article key={incident.id} className="panel-strong hover-lift rounded-xl p-5 border border-line">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                              <div className="min-w-0 space-y-2 flex-1">
                                <div className="flex flex-wrap items-center gap-3">
                                  <span className="rounded-full bg-accent/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">
                                    {getIncidentLabel(incident)}
                                  </span>
                                  <span className="text-xs text-muted">{incident.id}</span>
                                  <span className="rounded-full bg-white/6 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-foreground/80">
                                    {getIncidentStatus(incident)}
                                  </span>
                                </div>
                                <h4 className="text-[15px] font-semibold tracking-tight text-foreground">{getIncidentTitle(incident)}</h4>
                                <p className="text-sm leading-6 text-muted line-clamp-2">{getIncidentDescription(incident)}</p>
                              </div>
                              <div className="flex items-center gap-6 xl:border-l xl:border-line xl:pl-6">
                                <div className="min-w-32">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted mb-1">Assigned</p>
                                  <p className="text-[13px] font-medium text-foreground">{getAssignedUnit(incident)}</p>
                                </div>
                                {signedIn && canManageIncidents && isLiveIncident(incident) ? (
                                  <div className="flex flex-col gap-1.5">
                                    {[
                                      { value: "in_progress", label: "On Scene" },
                                      { value: "resolved", label: "Resolve" },
                                    ].map((option) => (
                                      <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => handleIncidentStatusChange(incident.id, option.value)}
                                        disabled={isIncidentStatusLoading(incident.id, option.value) || getIncidentStatus(incident).toLowerCase() === option.value.replace("_", " ")}
                                        className="rounded-full border border-line px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-foreground/75 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                                      >
                                        {isIncidentStatusLoading(incident.id, option.value) ? `...` : option.label}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </article>
                        ))}
                        {filteredIncidents.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-line bg-white/4 p-8 text-center text-sm text-muted">
                            No incidents match the current search.
                          </div>
                        ) : null}
                      </div>
                    </section>
                  </div>
                ) : null}

                {shouldRenderSection("realtime-feed") ? (
                  <section id="realtime-feed" className="panel scroll-mt-28 rounded-xl p-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted">Realtime feed</p>
                    <span className="rounded-full bg-accent/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">{realtimeStatus}</span>
                  </div>
                  <div className="mt-5 space-y-3">
                    {filteredRealtimeEvents.length > 0 ? filteredRealtimeEvents.map((event) => (
                      <div key={`${event.type}-${event.receivedAt}-filtered`} className="panel-strong hover-lift rounded-lg p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">{event.type}</p>
                        <p className="mt-2 text-sm text-foreground/85">{summarizeRealtimePayload(event.payload)}</p>
                        <p className="mt-1 text-xs text-muted">{new Date(event.receivedAt).toLocaleTimeString()}</p>
                      </div>
                    )) : null}
                    {filteredRealtimeEvents.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-line bg-white/4 p-4 text-sm text-muted">
                        No realtime events match the current search.
                      </div>
                    ) : null}
                  </div>
                  </section>
                ) : null}
              </div>
            </div>
          )}
          </div>
        </div>
      </main>

      {/* ── Modal overlay ── */}
      {openModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpenModal(null); }}
          onKeyDown={(e) => { if (e.key === "Escape") setOpenModal(null); }}
        >
          <div className="relative mx-4 max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-line bg-panel p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setOpenModal(null)}
              className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:text-foreground hover:bg-nav-hover"
            >
              ✕
            </button>

            {openModal === "incident-intake" ? (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-accent">New Incident</p>
                <h3 className="mt-2 text-lg font-semibold text-foreground">Create an active case</h3>
                <p className="mt-1 text-[12px] text-muted">{safeStations.length} stations available for dispatch</p>
                <form className="mt-5 grid gap-4" onSubmit={(e) => { handleCreateIncident(e); setOpenModal(null); }}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block space-y-1.5 text-sm font-medium text-foreground/85">
                      <span>Citizen name</span>
                      <input
                        value={incidentForm.citizen_name}
                        onChange={(event) => handleIncidentFieldChange("citizen_name", event.target.value)}
                        className="w-full rounded-lg border border-line bg-white/5 px-3.5 py-2.5 text-foreground outline-none transition focus:border-accent"
                        placeholder="Full name"
                        required
                      />
                    </label>
                    <label className="block space-y-1.5 text-sm font-medium text-foreground/85">
                      <span>Phone</span>
                      <input
                        value={incidentForm.citizen_phone ?? ""}
                        onChange={(event) => handleIncidentFieldChange("citizen_phone", event.target.value)}
                        className="w-full rounded-lg border border-line bg-white/5 px-3.5 py-2.5 text-foreground outline-none transition focus:border-accent"
                        placeholder="Contact number"
                      />
                    </label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="block space-y-1.5 text-sm font-medium text-foreground/85">
                      <span>Type</span>
                      <select
                        value={incidentForm.incident_type}
                        onChange={(event) => handleIncidentFieldChange("incident_type", event.target.value)}
                        className="w-full rounded-lg border border-line bg-white/5 px-3.5 py-2.5 text-foreground outline-none transition focus:border-accent"
                      >
                        <option value="medical">Medical</option>
                        <option value="fire">Fire</option>
                        <option value="crime">Crime</option>
                      </select>
                    </label>
                    <label className="block space-y-1.5 text-sm font-medium text-foreground/85">
                      <span>Latitude</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={incidentForm.latitude}
                        onChange={(event) => handleIncidentFieldChange("latitude", Number(event.target.value))}
                        className="w-full rounded-lg border border-line bg-white/5 px-3.5 py-2.5 text-foreground outline-none transition focus:border-accent"
                        required
                      />
                    </label>
                    <label className="block space-y-1.5 text-sm font-medium text-foreground/85">
                      <span>Longitude</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={incidentForm.longitude}
                        onChange={(event) => handleIncidentFieldChange("longitude", Number(event.target.value))}
                        className="w-full rounded-lg border border-line bg-white/5 px-3.5 py-2.5 text-foreground outline-none transition focus:border-accent"
                        required
                      />
                    </label>
                  </div>
                  <label className="block space-y-1.5 text-sm font-medium text-foreground/85">
                    <span>Notes</span>
                    <textarea
                      value={incidentForm.notes ?? ""}
                      onChange={(event) => handleIncidentFieldChange("notes", event.target.value)}
                      className="min-h-24 w-full rounded-lg border border-line bg-white/5 px-3.5 py-2.5 text-foreground outline-none transition focus:border-accent"
                      placeholder="Additional details..."
                    />
                  </label>
                  <div className="flex gap-3 justify-end">
                    <button type="button" onClick={() => setOpenModal(null)} className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-muted transition hover:text-foreground">Cancel</button>
                    <button
                      type="submit"
                      disabled={isCreatingIncident}
                      className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                    >
                      {isCreatingIncident ? "Creating..." : "Create Incident"}
                    </button>
                  </div>
                </form>
              </>
            ) : openModal === "vehicle-command" ? (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-signal">Fleet Control</p>
                <h3 className="mt-2 text-lg font-semibold text-foreground">Manage vehicles</h3>
                <p className="mt-1 text-[12px] text-muted">{filteredVehicles.length} vehicles in the fleet</p>
                <div className="mt-5 grid gap-4">
                  <label className="block space-y-1.5 text-sm font-medium text-foreground/85">
                    <span>Select vehicle</span>
                    <select
                      value={selectedVehicleID}
                      onChange={(event) => setStore({ selectedVehicleID: event.target.value })}
                      className="w-full rounded-lg border border-line bg-white/5 px-3.5 py-2.5 text-foreground outline-none transition focus:border-accent"
                      disabled={!canControlVehicles || filteredVehicles.length === 0}
                    >
                      {filteredVehicles.map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {(vehicle.license_plate || vehicle.id.slice(0, 8)) + " | " + titleCase(vehicle.status)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedVehicle ? (
                    <div className="panel-soft rounded-lg p-3.5 text-sm text-muted">
                      <p className="font-medium text-foreground">{selectedVehicle.license_plate || selectedVehicle.id.slice(0, 8)}</p>
                      <p className="mt-1">{titleCase(selectedVehicle.vehicle_type)} at {titleCase(selectedVehicle.station_type)} · Driver: {selectedVehicle.driver_name || "Unassigned"}</p>
                    </div>
                  ) : null}
                  <form className="grid gap-3" onSubmit={handleVehicleStatusSubmit}>
                    <label className="block space-y-1.5 text-sm font-medium text-foreground/85">
                      <span>Update status</span>
                      <select
                        value={vehicleStatus}
                        onChange={(event) => setStore({ vehicleStatus: event.target.value })}
                        className="w-full rounded-lg border border-line bg-white/5 px-3.5 py-2.5 text-foreground outline-none transition focus:border-accent"
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
                      className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-white/6 disabled:opacity-60"
                    >
                      {isUpdatingVehicleStatus ? "Updating..." : "Update Status"}
                    </button>
                  </form>
                  <div className="border-t border-line pt-3">
                    <p className="mb-3 text-[12px] font-medium text-muted">Move vehicle location</p>
                    <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={handleVehicleLocationSubmit}>
                      <label className="block space-y-1.5 text-sm font-medium text-foreground/85">
                        <span>Lat</span>
                        <input type="number" step="0.0001" value={vehicleLatitude} onChange={(event) => setStore({ vehicleLatitude: event.target.value })} className="w-full rounded-lg border border-line bg-white/5 px-3.5 py-2.5 text-foreground outline-none transition focus:border-accent" disabled={!selectedVehicleID} />
                      </label>
                      <label className="block space-y-1.5 text-sm font-medium text-foreground/85">
                        <span>Lng</span>
                        <input type="number" step="0.0001" value={vehicleLongitude} onChange={(event) => setStore({ vehicleLongitude: event.target.value })} className="w-full rounded-lg border border-line bg-white/5 px-3.5 py-2.5 text-foreground outline-none transition focus:border-accent" disabled={!selectedVehicleID} />
                      </label>
                      <button type="submit" disabled={isUpdatingVehicleLocation || !selectedVehicleID} className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60">
                        {isUpdatingVehicleLocation ? "Moving..." : "Move"}
                      </button>
                    </form>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
