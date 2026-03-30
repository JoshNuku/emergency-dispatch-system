import type {
  AuthTokens,
  CreateIncidentInput,
  DashboardStats,
  HospitalCapacity,
  Incident,
  RegionIncident,
  RegisterUserInput,
  ResourceUtilization,
  Station,
  UpdateStationInput,
  UserProfile,
  Vehicle,
} from "@/types/frontend";

export type {
  AuthTokens,
  CreateIncidentInput,
  DashboardStats,
  HospitalCapacity,
  Incident,
  RegionIncident,
  RegisterUserInput,
  ResourceUtilization,
  Station,
  UpdateStationInput,
  UserProfile,
  Vehicle,
} from "@/types/frontend";

const warnedMissingEnv = new Set<string>();

function resolveEnvUrl(name: string, value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  if (normalized) {
    return normalized.replace(/\/$/, "");
  }

  if (!warnedMissingEnv.has(name)) {
    warnedMissingEnv.add(name);
    console.warn(`Missing ${name}; falling back to ${fallback}`);
  }

  return fallback;
}

const authApiUrl = resolveEnvUrl(
  "NEXT_PUBLIC_AUTH_API_URL",
  process.env.NEXT_PUBLIC_AUTH_API_URL,
  "https://eds-auth.onrender.com",
);
const incidentApiUrl = resolveEnvUrl(
  "NEXT_PUBLIC_INCIDENT_API_URL",
  process.env.NEXT_PUBLIC_INCIDENT_API_URL,
  "https://eds-incident.onrender.com",
);
const dispatchApiUrl = resolveEnvUrl(
  "NEXT_PUBLIC_DISPATCH_API_URL",
  process.env.NEXT_PUBLIC_DISPATCH_API_URL,
  "https://eds-dispatch.onrender.com",
);
const analyticsApiUrl = resolveEnvUrl(
  "NEXT_PUBLIC_ANALYTICS_API_URL",
  process.env.NEXT_PUBLIC_ANALYTICS_API_URL,
  "https://eds-analytics.onrender.com",
);

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  // Safely handle empty responses (e.g. 204 No Content) to avoid
  // "Unexpected end of JSON input" when calling `response.json()`
  const text = await response.text();
  if (!text) {
    return undefined as unknown as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    // If response isn't valid JSON, return the raw text (cast to T).
    return text as unknown as T;
  }
}

function authHeader(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export function login(email: string, password: string) {
  return request<AuthTokens>(`${authApiUrl}/auth/login`, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function refreshTokens(refreshToken: string) {
  return request<AuthTokens>(`${authApiUrl}/auth/refresh-token`, {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export function getProfile(token: string) {
  return request<UserProfile>(`${authApiUrl}/auth/profile`, {
    headers: authHeader(token),
  });
}

export function getOpenIncidents(token: string) {
  return request<Incident[]>(`${incidentApiUrl}/incidents/open`, {
    headers: authHeader(token),
  });
}

export function getIncidents(token: string) {
  return request<Incident[]>(`${incidentApiUrl}/incidents`, {
    headers: authHeader(token),
  });
}

export function getVehicles(token: string) {
  return request<unknown>(`${dispatchApiUrl}/vehicles`, {
    headers: authHeader(token),
  }).then((payload) => {
    if (Array.isArray(payload)) return payload as Vehicle[];
    if (payload && typeof payload === "object") {
      const obj = payload as Record<string, unknown>;
      if (Array.isArray(obj.vehicles)) return obj.vehicles as Vehicle[];
      if (Array.isArray(obj.data)) return obj.data as Vehicle[];
      if (obj.data && typeof obj.data === "object") {
        const dataObj = obj.data as Record<string, unknown>;
        if (Array.isArray(dataObj.vehicles)) return dataObj.vehicles as Vehicle[];
      }
    }
    return [] as Vehicle[];
  });
}

export function getAnalyticsDashboard(token: string) {
  return request<DashboardStats>(`${analyticsApiUrl}/analytics/dashboard`, {
    headers: authHeader(token),
  });
}

export function getResponseTimes(token: string) {
  return request<Array<{ incident_type: string; avg_seconds: number; min_seconds: number; max_seconds: number; count: number }>>(
    `${analyticsApiUrl}/analytics/response-times`,
    {
      headers: authHeader(token),
    },
  );
}

export function getStations(token: string) {
  return request<Station[]>(`${incidentApiUrl}/stations`, {
    headers: authHeader(token),
  });
}

export function createIncident(token: string, input: CreateIncidentInput) {
  return request<{ incident: Incident; dispatch_warning?: string }>(`${incidentApiUrl}/incidents`, {
    method: "POST",
    headers: authHeader(token),
    body: JSON.stringify(input),
  });
}

export function updateIncidentStatus(token: string, incidentID: string, status: string) {
  return request<Incident>(`${incidentApiUrl}/incidents/${incidentID}/status`, {
    method: "PUT",
    headers: authHeader(token),
    body: JSON.stringify({ status }),
  });
}

export function updateVehicleStatus(token: string, vehicleID: string, status: string) {
  return request<Vehicle>(`${dispatchApiUrl}/vehicles/${vehicleID}/status`, {
    method: "PUT",
    headers: authHeader(token),
    body: JSON.stringify({ status }),
  });
}

export function updateVehicleLocation(token: string, vehicleID: string, latitude: number, longitude: number) {
  return request<{ vehicle_id: string; latitude: number; longitude: number; status: string }>(
    `${dispatchApiUrl}/vehicles/${vehicleID}/location`,
    {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify({ latitude, longitude }),
    },
  );
}

export function updateVehicle(token: string, vehicleID: string, input: Partial<Vehicle>) {
  return request<Vehicle>(`${dispatchApiUrl}/vehicles/${vehicleID}`, {
    method: "PUT",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function createVehicle(token: string, input: Partial<Vehicle>) {
  return request<Vehicle>(`${dispatchApiUrl}/vehicles/register`, {
    method: "POST",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function deleteVehicle(token: string, vehicleID: string) {
  return request<void>(`${dispatchApiUrl}/vehicles/${vehicleID}`, {
    method: "DELETE",
    headers: authHeader(token),
  });
}

// ── User management ──

export function getUsers(token: string) {
  return request<UserProfile[]>(`${authApiUrl}/auth/users`, {
    headers: authHeader(token),
  });
}

export function registerUser(token: string, input: RegisterUserInput) {
  return request<{ message: string; user: UserProfile }>(`${authApiUrl}/auth/register`, {
    method: "POST",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateUser(token: string, userID: string, input: Partial<RegisterUserInput>) {
  return request<UserProfile>(`${authApiUrl}/auth/users/${userID}`, {
    method: "PUT",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateMyProfile(
  token: string,
  input: { name?: string; password?: string },
) {
  return request<UserProfile>(`${authApiUrl}/auth/profile`, {
    method: "PUT",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function deleteUser(token: string, userID: string) {
  return request<void>(`${authApiUrl}/auth/users/${userID}`, {
    method: "DELETE",
    headers: authHeader(token),
  });
}

// ── Station management ──

export function updateStation(token: string, stationID: string, input: UpdateStationInput) {
  return request<Station>(`${incidentApiUrl}/stations/${stationID}`, {
    method: "PUT",
    headers: authHeader(token),
    body: JSON.stringify(input),
  });
}

export function createStation(token: string, input: Partial<Station>) {
  return request<Station>(`${incidentApiUrl}/stations`, {
    method: "POST",
    headers: authHeader(token),
    body: JSON.stringify(input),
  });
}

export function deleteStation(token: string, stationID: string) {
  return request<void>(`${incidentApiUrl}/stations/${stationID}`, {
    method: "DELETE",
    headers: authHeader(token),
  });
}

// ── Extended analytics ──

export function getIncidentsByRegion(token: string) {
  return request<RegionIncident[]>(`${analyticsApiUrl}/analytics/incidents-by-region`, {
    headers: authHeader(token),
  });
}

export function getResourceUtilization(token: string) {
  return request<ResourceUtilization[]>(`${analyticsApiUrl}/analytics/resource-utilization`, {
    headers: authHeader(token),
  });
}

export function getHospitalCapacity(token: string) {
  return request<HospitalCapacity[]>(`${analyticsApiUrl}/analytics/hospital-capacity`, {
    headers: authHeader(token),
  });
}
