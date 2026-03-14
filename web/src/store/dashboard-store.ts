"use client";

import { useSyncExternalStore } from "react";

import type {
  CreateIncidentInput,
  LiveState,
  LoadingAction,
  SidebarSectionKey,
  ThemeMode,
} from "@/types/frontend";

export type DashboardStoreState = {
  email: string;
  password: string;
  token: string | null;
  state: LiveState;
  authError: string | null;
  dataError: string | null;
  actionError: string | null;
  actionNotice: string | null;
  loadingAction: LoadingAction;
  isBootstrapping: boolean;
  theme: ThemeMode;
  commandQuery: string;
  sidebarSections: Record<SidebarSectionKey, boolean>;
  activeSectionID: string;
  incidentForm: CreateIncidentInput;
  selectedVehicleID: string;
  vehicleStatus: string;
  vehicleLatitude: string;
  vehicleLongitude: string;
};

const emptyLiveState: LiveState = {
  profile: null,
  incidents: [],
  vehicles: [],
  stations: [],
  dashboard: null,
  responseTimes: [],
};

const initialState: DashboardStoreState = {
  email: "",
  password: "",
  token: null,
  state: emptyLiveState,
  authError: null,
  dataError: null,
  actionError: null,
  actionNotice: null,
  loadingAction: { kind: "idle" },
  isBootstrapping: true,
  theme: "dark",
  commandQuery: "",
  sidebarSections: {
    workspace: true,
    navigation: true,
    system: true,
    services: true,
  },
  activeSectionID: "top",
  incidentForm: {
    citizen_name: "",
    citizen_phone: "",
    incident_type: "medical",
    latitude: 5.6512,
    longitude: -0.1869,
    notes: "",
  },
  selectedVehicleID: "",
  vehicleStatus: "available",
  vehicleLatitude: "5.6512",
  vehicleLongitude: "-0.1869",
};

let currentState = initialState;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export const dashboardStore = {
  getState() {
    return currentState;
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  setState(update: Partial<DashboardStoreState> | ((state: DashboardStoreState) => Partial<DashboardStoreState>)) {
    const next = typeof update === "function" ? update(currentState) : update;
    currentState = { ...currentState, ...next };
    emitChange();
  },
  reset() {
    currentState = initialState;
    emitChange();
  },
  emptyLiveState,
};

export function useDashboardStore() {
  return useSyncExternalStore(dashboardStore.subscribe, dashboardStore.getState, dashboardStore.getState);
}