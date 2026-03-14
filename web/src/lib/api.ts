import type {
  AuthTokens,
  CreateIncidentInput,
  DashboardStats,
  Incident,
  Station,
  UserProfile,
  Vehicle,
} from "@/types/frontend";

export type {
  AuthTokens,
  CreateIncidentInput,
  DashboardStats,
  Incident,
  Station,
  UserProfile,
  Vehicle,
} from "@/types/frontend";

const authApiUrl = process.env.NEXT_PUBLIC_AUTH_API_URL ?? "http://localhost:8081";
const incidentApiUrl = process.env.NEXT_PUBLIC_INCIDENT_API_URL ?? "http://localhost:8082";
const dispatchApiUrl = process.env.NEXT_PUBLIC_DISPATCH_API_URL ?? "http://localhost:8083";
const analyticsApiUrl = process.env.NEXT_PUBLIC_ANALYTICS_API_URL ?? "http://localhost:8084";

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

  return response.json() as Promise<T>;
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

export function getVehicles(token: string) {
  return request<Vehicle[]>(`${dispatchApiUrl}/vehicles`, {
    headers: authHeader(token),
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
