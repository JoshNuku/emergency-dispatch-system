export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  role: string;
  station_id?: string;
  created_at?: string;
  updated_at?: string;
};

export type Incident = {
  id: string;
  citizen_name: string;
  citizen_phone?: string;
  incident_type: string;
  latitude: number;
  longitude: number;
  notes?: string;
  assigned_unit_id?: string;
  assigned_unit_type?: string;
  status: string;
  dispatched_at?: string;
  resolved_at?: string;
  created_at?: string;
  updated_at?: string;
};

export type Vehicle = {
  id: string;
  station_id: string;
  station_type: string;
  vehicle_type: string;
  license_plate?: string;
  driver_name?: string;
  driver_id?: string;
  status: string;
  latitude: number;
  longitude: number;
  incident_id?: string;
  created_at?: string;
  updated_at?: string;
};

export type DashboardStats = {
  total_incidents: number;
  avg_response_time_seconds: number;
  incidents_by_type: Array<{
    incident_type: string;
    count: number;
  }>;
};

export type Station = {
  id: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  is_available: boolean;
  total_capacity?: number;
  available_capacity?: number;
  contact_phone?: string;
  created_at?: string;
  updated_at?: string;
};

export type CreateIncidentInput = {
  citizen_name: string;
  citizen_phone?: string;
  incident_type: string;
  latitude: number;
  longitude: number;
  notes?: string;
};

export type RegisterUserInput = {
  name: string;
  email: string;
  password: string;
  role: string;
  station_id?: string;
};

export type UpdateStationInput = {
  name?: string;
  type?: string;
  latitude?: number;
  longitude?: number;
  is_available?: boolean;
  total_capacity?: number;
  available_capacity?: number;
  contact_phone?: string;
};


export type RegionIncident = {
  region: string;
  incident_type: string;
  count: number;
};

export type ResourceUtilization = {
  service_type: string;
  total_units: number;
  active_units: number;
  utilization_percent: number;
};

export type HospitalCapacity = {
  hospital_id: string;
  hospital_name: string;
  total_beds: number;
  available_beds: number;
  occupancy_percent: number;
};

export type RealtimeEvent = {
  type: string;
  payload: unknown;
  receivedAt: string;
};

export type LiveState = {
  profile: UserProfile | null;
  incidents: Incident[];
  vehicles: Vehicle[];
  stations: Station[];
  dashboard: DashboardStats | null;
  responseTimes: Array<{
    incident_type: string;
    avg_seconds: number;
    min_seconds: number;
    max_seconds: number;
    count: number;
  }>;
  incidentsByRegion: RegionIncident[];
  resourceUtilization: ResourceUtilization[];
  hospitalCapacity: HospitalCapacity[];
};

export type WorkspaceView = "home" | "admin" | "operations" | "driver" | "responder";

export type DashboardSectionRoute =
  | "map"
  | "incidents"
  | "intake"
  | "workflow"
  | "vehicles"
  | "telemetry"
  | "realtime";

export type DashboardAppProps = {
  workspace?: WorkspaceView;
  section?: DashboardSectionRoute;
};

export type RoleWorkspaceCard = {
  title: string;
  detail: string;
  badge: string;
  tone: "accent" | "signal" | "warning";
};

export type ThemeMode = "dark" | "light";

export type SidebarSectionKey =
  | "workspace"
  | "navigation"
  | "system"
  | "services";

export type DashboardSectionLink = {
  id: string;
  label: string;
  icon: string;
  href?: string;
};

export type ModalView =
  | "incident-intake"
  | "vehicle-command"
  | "station-manage"
  | "user-manage"
  | "my-profile"
  | "confirm-delete-user"
  | "confirm-delete-station"
  | "login"
  | "incident-details"
  | null;

export type LoadingAction =
  | { kind: "idle" }
  | { kind: "login" }
  | { kind: "refresh" }
  | { kind: "create-incident" }
  | { kind: "incident-status"; incidentID: string; status: string }
  | { kind: "vehicle-status"; vehicleID: string }
  | { kind: "vehicle-location"; vehicleID: string }
  | { kind: "register-user" }
  | { kind: "update-user"; userID?: string }
  | { kind: "update-profile" }
  | { kind: "delete-user"; userID?: string }
  | { kind: "create-station" }
  | { kind: "delete-station"; stationID?: string }
  | { kind: "update-station"; stationID: string }
  | { kind: "load-users" };
