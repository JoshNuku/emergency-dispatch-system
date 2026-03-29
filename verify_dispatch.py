import requests
import json
import time

# Corrected ports from .env
AUTH_URL = "http://localhost:8081"
INCIDENT_URL = "http://localhost:8082"
DISPATCH_URL = "http://localhost:8083"

def get_token():
    try:
        resp = requests.post(f"{AUTH_URL}/auth/login", json={
            "email": "system_admin@dispatch.local",
            "password": "dispatch1234"
        })
        resp.raise_for_status()
        return resp.json()["access_token"]
    except Exception as e:
        print(f"Failed to get token: {e}")
        return None

def test_nearest_vehicle():
    token = get_token()
    if not token:
        return
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Get all vehicles to find some coordinates
    try:
        resp = requests.get(f"{DISPATCH_URL}/vehicles", headers=headers)
        resp.raise_for_status()
        vehicles = resp.json()
    except Exception as e:
        print(f"Failed to fetch vehicles: {e}")
        return

    print(f"Found {len(vehicles)} vehicles")

    # Pick two ambulances
    ambulances = [v for v in vehicles if v["vehicle_type"] == "ambulance" and v["status"] == "available"]
    if len(ambulances) < 2:
        print("Not enough available ambulances to test proximity. Found:", len(ambulances))
        return

    v1 = ambulances[0]
    v2 = ambulances[1]

    print(f"Ambulance 1: {v1['id']} at ({v1['latitude']}, {v1['longitude']})")
    print(f"Ambulance 2: {v2['id']} at ({v2['latitude']}, {v2['longitude']})")

    # 2. Create an incident very close to Ambulance 1
    incident_data = {
        "citizen_name": "Test User",
        "incident_type": "medical",
        "latitude": v1["latitude"] + 0.0001,
        "longitude": v1["longitude"] + 0.0001,
        "notes": "Testing nearest responder"
    }

    print(f"\nCreating incident near Ambulance 1 at ({incident_data['latitude']}, {incident_data['longitude']})...")
    try:
        resp = requests.post(f"{INCIDENT_URL}/incidents", json=incident_data, headers=headers)
        resp.raise_for_status()
        incident = resp.json()["incident"]
    except Exception as e:
        print(f"Failed to create incident: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print("Response:", e.response.text)
        return

    print(f"Incident created: {incident['id']}")
    print(f"Assigned Unit: {incident.get('assigned_unit_id')} (Type: {incident.get('assigned_unit_type')})")

    if incident.get("assigned_unit_id") == v1["id"]:
        print("SUCCESS: Correctly assigned nearest ambulance (Ambulance 1)")
    else:
        print(f"FAILURE: Expected Ambulance 1 ({v1['id']}), but got {incident.get('assigned_unit_id')}")

if __name__ == "__main__":
    test_nearest_vehicle()
