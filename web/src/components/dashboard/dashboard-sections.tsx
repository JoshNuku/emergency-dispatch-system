"use client";

import type { ComponentType } from "react";

import { Car, Zap } from "lucide-react";

import type { Incident, Vehicle } from "@/types/frontend";
import { formatIncidentCoords, getVehicleLabel } from "@/components/dashboard/dashboard-utils";

type MapPoint = {
  id: string;
  label: string;
  detail: string;
  latitude: number;
  longitude: number;
  tone: "incident" | "vehicle";
};

export type LiveResponseCard = {
  label: string;
  value: string;
  detail: string;
  tone: "signal" | "warning" | "danger";
};

export function TopOverviewSection(props: {
  liveResponseCards: LiveResponseCard[];
  mapPoints: MapPoint[];
  incidentsToShow: Incident[];
  onOpenIncidentDetails: (incidentId: string) => void;
  MapViewComponent: ComponentType<{ points: MapPoint[] }>;
}) {
  const { liveResponseCards, mapPoints, incidentsToShow, onOpenIncidentDetails, MapViewComponent } =
    props;

  return (
    <div className="animate-in fade-in duration-500 space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {liveResponseCards.map((c, i) => (
          <div
            key={i}
            className="p-6 rounded-2xl border border-zinc-800 bg-[#0c0c0c] hover:border-zinc-700 transition-all"
          >
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
              {c.label}
            </div>
            <div className="text-2xl font-bold">{c.value}</div>
            <p className="text-[10px] text-zinc-600 mt-2">{c.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="aspect-video rounded-2xl border border-zinc-800 bg-[#0c0c0c] overflow-hidden">
          <MapViewComponent points={mapPoints} />
        </div>
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" /> Critical Priority
          </h3>
          <div className="space-y-3">
            {incidentsToShow.slice(0, 3).map((inc) => (
              <div
                key={inc.id}
                onClick={() => onOpenIncidentDetails(inc.id)}
                className="p-4 rounded-xl border border-zinc-800 bg-[#0c0c0c] hover:border-zinc-700 transition-all cursor-pointer"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-bold">{inc.citizen_name}</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5 uppercase tracking-wide">
                      {inc.incident_type} • {formatIncidentCoords(inc.latitude, inc.longitude)}
                    </div>
                  </div>
                  <div className="px-2 py-0.5 rounded-full border border-zinc-800 bg-zinc-900 text-[9px] font-bold text-zinc-400 uppercase">
                    {inc.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DispatchesSection(props: {
  filteredIncidents: Incident[];
  onOpenIncidentDetails: (incidentId: string) => void;
}) {
  const { filteredIncidents, onOpenIncidentDetails } = props;

  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Active Dispatches</h1>
      <div className="grid grid-cols-1 gap-3">
        {filteredIncidents.map((inc) => (
          <div
            key={inc.id}
            onClick={() => onOpenIncidentDetails(inc.id)}
            className="p-5 rounded-2xl border border-zinc-800 bg-[#0c0c0c] flex items-center justify-between hover:border-zinc-700 transition-all cursor-pointer"
          >
            <div>
              <div className="text-sm font-bold">{inc.citizen_name}'s Request</div>
              <div className="text-[11px] text-zinc-500 uppercase tracking-widest mt-1">
                {inc.incident_type} • {formatIncidentCoords(inc.latitude, inc.longitude)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mb-1">
                State
              </div>
              <div className="text-xs font-bold text-blue-500 uppercase">{inc.status}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FleetSection(props: {
  filteredVehicles: Vehicle[];
  onOpenVehicleCommand: (vehicleId: string) => void;
}) {
  const { filteredVehicles, onOpenVehicleCommand } = props;

  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Fleet Roster</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {filteredVehicles.map((v) => (
          <div
            key={v.id}
            onClick={() => onOpenVehicleCommand(v.id)}
            className="p-6 rounded-2xl border border-zinc-800 bg-[#0c0c0c] flex flex-col hover:border-zinc-700 transition-all cursor-pointer"
          >
            <div className="flex justify-between items-center mb-6">
              <div className="w-10 h-10 rounded-2xl bg-zinc-900 flex items-center justify-center text-zinc-500">
                <Car className="w-5 h-5" />
              </div>
              <div className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                {v.status.toUpperCase()}
              </div>
            </div>
            <div className="text-lg font-bold">{getVehicleLabel(v)}</div>
            <div className="text-[11px] text-zinc-500 uppercase font-bold tracking-tight mt-1">
              {v.vehicle_type}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnalyticsSection() {
  return (
    <div className="animate-in fade-in duration-500 space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">Performance Summary</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="p-12 rounded-3xl border border-zinc-800 bg-[#0c0c0c] text-center">
          <div className="text-[11px] text-zinc-600 font-bold uppercase tracking-[0.2em] mb-4">
            Mean Response Time
          </div>
          <div className="text-6xl font-bold tracking-tighter">12:34</div>
        </div>
        <div className="p-12 rounded-3xl border border-zinc-800 bg-[#0c0c0c] text-center">
          <div className="text-[11px] text-zinc-600 font-bold uppercase tracking-[0.2em] mb-4">
            Operational Uptime
          </div>
          <div className="text-6xl font-bold tracking-tighter text-emerald-500">99.9%</div>
        </div>
      </div>
    </div>
  );
}

