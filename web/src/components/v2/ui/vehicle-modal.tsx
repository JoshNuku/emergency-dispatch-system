"use client";

import { useState, useMemo } from "react";
import { Modal } from "@/components/v2/ui/modal";
import { Button } from "@/components/v2/ui/button";
import { Input } from "@/components/v2/ui/input";
import { titleCase } from "@/lib/normalizers";
import type { Station, UserProfile, Vehicle } from "@/types/frontend";

type VehicleModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<Vehicle>) => Promise<void>;
  stations: Station[];
  drivers: UserProfile[];
  existingPlates?: string[];
  loading?: boolean;
};

// Vehicle type options and helpers
const VEHICLE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "ambulance", label: "Ambulance" },
  { value: "fire_truck", label: "Fire Truck" },
  { value: "police_car", label: "Police Car" },
];

function stationTypeToVehicleTypes(stationType?: string) {
  if (!stationType) return VEHICLE_TYPE_OPTIONS.map((o) => o.value);
  switch (stationType) {
    case "hospital":
      return ["ambulance"];
    case "fire":
      return ["fire_truck"];
    case "police":
      return ["police_car"];
    default:
      return VEHICLE_TYPE_OPTIONS.map((o) => o.value);
  }
}

function labelForVehicleType(value: string) {
  const found = VEHICLE_TYPE_OPTIONS.find((o) => o.value === value);
  if (found) return found.label;
  return titleCase(value.replace(/_/g, " "));
}

function vehicleTypeToDriverRole(vehicleType?: string) {
  switch (vehicleType) {
    case "ambulance":
      return "ambulance_driver";
    case "fire_truck":
      return "fire_driver";
    case "police_car":
      return "police_driver";
    default:
      return "";
  }
}

function getDriversForVehicleType(vehicleType: string, allDrivers: UserProfile[]) {
  const requiredRole = vehicleTypeToDriverRole(vehicleType);
  if (!requiredRole) return allDrivers.filter((u) => (u.role || "").toLowerCase().includes("driver"));
  return allDrivers.filter((u) => (u.role || "").toLowerCase() === requiredRole);
}

function getStationsForVehicleType(vehicleType: string, allStations: Station[]) {
  switch (vehicleType) {
    case "ambulance":
      return allStations.filter((s) => s.type === "hospital");
    case "fire_truck":
      return allStations.filter((s) => s.type === "fire");
    case "police_car":
      return allStations.filter((s) => s.type === "police");
    default:
      return allStations;
  }
}

export function VehicleModal({
  open,
  onClose,
  onSave,
  stations,
  drivers,
  existingPlates,
  loading,
}: VehicleModalProps) {
  const [licensePlate, setLicensePlate] = useState("");
  const [vehicleType, setVehicleType] = useState("ambulance");
  const [stationID, setStationID] = useState("");
  const [driverID, setDriverID] = useState("");
  const [error, setError] = useState<string | null>(null);

  const duplicatePlate = !!(licensePlate && (existingPlates ?? []).some((p) => p === licensePlate));

  // Filter drivers by vehicle type
  const compatibleDrivers = useMemo(() => {
    return getDriversForVehicleType(vehicleType, drivers);
  }, [vehicleType, drivers]);

  const handleSave = async () => {
    const station = stations.find((s) => s.id === stationID);
    const driver = drivers.find((d) => d.id === driverID);

    try {
      setError(null);
      await onSave({
        license_plate: licensePlate,
        vehicle_type: vehicleType,
        station_id: stationID,
        station_type: station?.type ?? "hospital",
        driver_id: driverID || undefined,
        driver_name: driver?.name || undefined,
        latitude: station?.latitude ?? 0,
        longitude: station?.longitude ?? 0,
      });

      // Reset form after successful save
      setLicensePlate("");
      setDriverID("");
      setStationID("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add New Vehicle"
      description="Register a new unit to the fleet roster."
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSave()}
            disabled={loading || !licensePlate || !stationID || duplicatePlate}
          >
            {loading ? "Registering..." : "Register Unit"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <label className="text-[12px] font-semibold text-muted tracking-tight">
            License Plate
          </label>
          <Input
            value={licensePlate}
            onChange={(e) => {
              setLicensePlate(e.target.value);
              setError(null);
            }}
            placeholder="e.g. UNIT-102"
          />
          {duplicatePlate && (
            <p className="text-[12px] mt-1 text-danger">License plate already exists</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-semibold text-muted tracking-tight">
            Assigned Station
          </label>
          <select
            value={stationID}
            onChange={(e) => {
              const newStationId = e.target.value;
              setStationID(newStationId);
              setError(null);
              // if station selected, ensure vehicleType is valid for that station
              const station = stations.find((s) => s.id === newStationId);
              const allowed = stationTypeToVehicleTypes(station?.type);
              if (allowed.length > 0 && !allowed.includes(vehicleType)) {
                setVehicleType(allowed[0]);
              }
            }}
            className="h-9 w-full rounded-lg border border-line bg-background px-3 text-[13px] text-foreground outline-none transition focus:border-line-strong focus:ring-2 focus:ring-accent/25"
          >
            <option value="">Select a station...</option>
            {getStationsForVehicleType(vehicleType, stations).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.type})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-semibold text-muted tracking-tight">
            Vehicle Type
          </label>
          <select
            value={vehicleType}
            onChange={(e) => {
              setVehicleType(e.target.value);
              setError(null);
            }}
            className="h-9 w-full rounded-lg border border-line bg-background px-3 text-[13px] text-foreground outline-none transition focus:border-line-strong focus:ring-2 focus:ring-accent/25"
          >
            {(() => {
              const station = stations.find((s) => s.id === stationID);
              const allowedValues = stationTypeToVehicleTypes(station?.type);
              const options = VEHICLE_TYPE_OPTIONS.filter((o) => allowedValues.includes(o.value));
              // if current vehicleType isn't present, include it with a friendly label
              if (!options.find((o) => o.value === vehicleType)) {
                options.unshift({ value: vehicleType, label: labelForVehicleType(vehicleType) });
              }
              return options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ));
            })()}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-semibold text-muted tracking-tight">
            Assigned Driver (Optional)
          </label>
          <select
            value={driverID}
            onChange={(e) => {
              setDriverID(e.target.value);
              setError(null);
            }}
            className="h-9 w-full rounded-lg border border-line bg-background px-3 text-[13px] text-foreground outline-none transition focus:border-line-strong focus:ring-2 focus:ring-accent/25"
          >
            <option value="">Unassigned</option>
            {compatibleDrivers.length > 0 ? (
              compatibleDrivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.role.replace("_", " ")})
                </option>
              ))
            ) : (
              <option disabled>No drivers available</option>
            )}
          </select>
        </div>
        {error && (
          <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
