/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type mapboxgl from "mapbox-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type MapPoint = {
  id: string;
  label: string;
  detail: string;
  latitude: number;
  longitude: number;
  tone: "incident" | "vehicle" | "station";
  vehicle_type?: string;
  station_type?: string;
};

type OperationsMapProps = {
  points: MapPoint[];
  className?: string;
  onMapClick?: (coords: { lat: number; lng: number }) => void;
  focusPoint?: { latitude: number; longitude: number; zoom?: number };
};

const defaultCenter: [number, number] = [-0.187, 5.651];

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const TONE_COLOR: Record<string, string> = {
  incident: "#f24822",
  vehicle: "#14ae5c",
  station: "#2563eb",
};

const TONE_EMOJI: Record<string, string> = {
  incident: "🚨",
  vehicle: "🚑",
  station: "🏥",
};

const VEHICLE_EMOJI: Record<string, string> = {
  ambulance: "🚑",
  fire_truck: "🚒",
  police_car: "🚓",
  bike: "🏍️",
  motorbike: "🏍️",
  motorcycle: "🏍️",
  truck: "🚚",
  vehicle: "🚗",
};

function stationEmojiFromType(rawType: string | undefined): string {
  const value = String(rawType || "").toLowerCase();
  if (value.includes("police")) return "👮";
  if (value.includes("fire")) return "🧯";
  if (value.includes("hospital") || value.includes("medical") || value.includes("ambulance")) return "🏥";
  return "🏢";
}

function stationLabelFromType(rawType: string | undefined): string {
  const value = String(rawType || "").toLowerCase();
  if (value.includes("police")) return "Police Station";
  if (value.includes("fire")) return "Fire Station";
  if (value.includes("hospital") || value.includes("medical") || value.includes("ambulance")) return "Hospital";
  return "Station";
}

function vehicleLabelFromType(rawType: string | undefined): string {
  const value = String(rawType || "").toLowerCase().trim();
  if (!value) return "Vehicle";
  return value.replaceAll("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function numberIsFinite(v: any) {
  return typeof v === "number" && isFinite(v);
}

export default function OperationsMap({ points, className, onMapClick, focusPoint }: OperationsMapProps) {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapboxRef = useRef<typeof mapboxgl | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [mapReadyVersion, setMapReadyVersion] = useState(0);

  const counts = useMemo(() => {
    const tally = { station: 0, incident: 0, vehicle: 0 };
    for (const point of points || []) {
      const tone = String(point.tone || "").toLowerCase();
      if (tone === "station") tally.station += 1;
      else if (tone === "incident") tally.incident += 1;
      else if (tone === "vehicle") tally.vehicle += 1;
    }
    return tally;
  }, [points]);

  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  const clearDomMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
  }, []);

  const createDomMarkersFromFeatures = useCallback((features: any[]) => {
    const map = mapRef.current;
    if (!map || !mapboxRef.current) return;
    clearDomMarkers();
    for (const f of features) {
      try {
        const props = f.properties || {};

        const coords = f.geometry.coordinates;
        const tone = String(props.tone || "vehicle").toLowerCase();
        const vehicleType = String(props.vehicle_type || "").toLowerCase();
        const stationType = String(props.station_type || "").toLowerCase();

        const container = document.createElement("div");
        container.className = "dom-marker flex items-center";
        container.style.display = "flex";
        container.style.alignItems = "center";
        container.style.flexDirection = "column";
        container.style.gap = "2px";

        const iconWrap = document.createElement("div");
        iconWrap.style.width = "auto";
        iconWrap.style.height = "auto";
        iconWrap.style.display = "flex";
        iconWrap.style.alignItems = "center";
        iconWrap.style.justifyContent = "center";
        iconWrap.style.background = "transparent";
        iconWrap.style.border = "0";
        iconWrap.style.boxShadow = "none";

        const emojiFallback =
          tone === "vehicle"
            ? (VEHICLE_EMOJI[vehicleType] || TONE_EMOJI.vehicle)
            : tone === "station"
              ? stationEmojiFromType(stationType || String(props.detail || props.label || ""))
            : TONE_EMOJI[tone] || "📍";

        const emoji = document.createElement("span");
        emoji.textContent = emojiFallback;
        emoji.style.fontSize = "24px";
        emoji.style.lineHeight = "1";
        emoji.style.filter = "drop-shadow(0 2px 2px rgba(0, 0, 0, 0.38))";
        iconWrap.appendChild(emoji);

        container.appendChild(iconWrap);

        const markerLabel = document.createElement("span");
        markerLabel.style.fontSize = "10px";
        markerLabel.style.fontWeight = "600";
        markerLabel.style.color = "#ffffff";
        markerLabel.style.background = "rgba(15, 23, 42, 0.72)";
        markerLabel.style.border = "1px solid rgba(148, 163, 184, 0.34)";
        markerLabel.style.borderRadius = "9999px";
        markerLabel.style.padding = "1px 6px";
        markerLabel.style.whiteSpace = "nowrap";
        markerLabel.style.textShadow = "0 1px 1px rgba(0,0,0,0.45)";
        markerLabel.textContent =
          tone === "vehicle"
            ? vehicleLabelFromType(vehicleType)
            : tone === "incident"
              ? "Incident"
              : stationLabelFromType(stationType || String(props.detail || props.label || ""));
        container.appendChild(markerLabel);

        // Keep markers visually minimal; full details are shown in popup on click.

        const fallbackDetail =
          tone === "vehicle"
            ? vehicleLabelFromType(vehicleType)
            : tone === "incident"
              ? "Incident"
              : "Station";
        const popupHtml = `
          <div style="padding:6px 4px;min-width:180px">
            <div style="font-weight:700;font-size:13px;color:#ffffff">${escapeHtml(String(props.label || "Location"))}</div>
            <div style="margin-top:4px;color:#e0e0e0;font-size:12px">${escapeHtml(String(props.detail || fallbackDetail))}</div>
            <div style="margin-top:6px;font-size:11px;color:#d0d0d0">Lat ${Number(coords[1]).toFixed(5)}, Lng ${Number(coords[0]).toFixed(5)}</div>
          </div>
        `;
        const popup = new (mapboxRef.current as any).Popup({ offset: 18 }).setHTML(popupHtml);

        const marker = new (mapboxRef.current as any).Marker({ element: container, anchor: "bottom" })
          .setLngLat([coords[0], coords[1]])
          .setPopup(popup)
          .addTo(map);

        container.style.cursor = "pointer";
        container.title = `${String(props.label || "Location")}: ${String(props.detail || fallbackDetail)}`;

        markersRef.current.push(marker);
      } catch (e) {
        /* ignore individual marker failures */
      }
    }
  }, [clearDomMarkers]);

  useEffect(() => {
    const token = mapboxToken;
    if (!token || !mapContainerRef.current || mapRef.current) return;

    let isMounted = true;
    let map: mapboxgl.Map | null = null;

    const handleResize = () => {
      const m = mapRef.current;
      try {
        if (!m || typeof (m as any).resize !== "function") return;
        const canvas = (m as any).getCanvas ? (m as any).getCanvas() : null;
        if (!canvas || typeof canvas.width !== "number") return;
        m.resize();
      } catch (e) {
        /* ignore resize errors */
      }
    };

    const initialize = async () => {
      try {
        const mapboxModule = await import("mapbox-gl");
        if (!isMounted || !mapContainerRef.current) return;
        const mapboxgl = mapboxModule.default;
        mapboxgl.accessToken = token;
        mapboxRef.current = mapboxgl;

        if (mapContainerRef.current.innerHTML !== "") {
          mapContainerRef.current.innerHTML = "";
        }

        map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: "mapbox://styles/mapbox/streets-v12",
          center: defaultCenter,
          zoom: 13,
          pitch: 0,
        });
        mapRef.current = map;

        map.on("load", () => {
          if (!isMounted) return;
          map?.resize();
          setMapReadyVersion((v) => v + 1);
        });

        map.on("styledata", () => {
          if (!isMounted) return;
          setMapReadyVersion((v) => v + 1);
        });

        map.on("click", (e) => {
          onMapClickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        });

        window.addEventListener("resize", handleResize);
        if (mapContainerRef.current) {
          resizeObserverRef.current = new ResizeObserver(() => handleResize());
          resizeObserverRef.current.observe(mapContainerRef.current);
        }

      } catch (e) {}
    };

    initialize();
    return () => {
      isMounted = false;
      window.removeEventListener("resize", handleResize);
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch (e) {
          /* ignore */
        }
        mapRef.current = null;
      }
      if (resizeObserverRef.current) {
        try {
          resizeObserverRef.current.disconnect();
        } catch (e) {}
        resizeObserverRef.current = null;
      }
    };
  }, [mapboxToken]);

  useEffect(() => {
    const map = mapRef.current;
    const mapboxglLocal = mapboxRef.current;
    if (!map || !mapboxglLocal) return;

    const features = (points || []).map((p) => {
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [Number(p.longitude), Number(p.latitude)] },
        properties: {
          id: p.id,
          label: String(p.label || ""),
          detail: String(p.detail || ""),
          tone: String(p.tone || "vehicle").toLowerCase(),
          vehicle_type: String(p.vehicle_type || ""),
          station_type: String(p.station_type || ""),
        },
      };
    }).filter((f) => {
      const c = (f.geometry as any).coordinates as number[];
      return Array.isArray(c) && numberIsFinite(c[1]) && Math.abs(c[1]) <= 90 && Math.abs(c[0]) <= 180;
    });

    const applyLayers = () => {
      try {
        if (!map.getStyle()) return;

        createDomMarkersFromFeatures(features);

      } catch (e) {}
    };

    if (map.isStyleLoaded()) applyLayers(); else {
      map.once("styledata", applyLayers);
      map.once("load", applyLayers);
    }

    try {
      const bounds = new (mapboxglLocal as any).LngLatBounds();
      for (const f of features) bounds.extend((f.geometry as any).coordinates as [number, number]);
      if (features.length > 0 && !bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 800 });
    } catch (e) {}

    return () => {
      clearDomMarkers();
    };
  }, [points, mapReadyVersion, clearDomMarkers, createDomMarkersFromFeatures]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusPoint) return;
    const lat = Number(focusPoint.latitude);
    const lng = Number(focusPoint.longitude);
    if (!numberIsFinite(lat) || !numberIsFinite(lng)) return;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;

    try {
      map.flyTo({
        center: [lng, lat],
        zoom: focusPoint.zoom ?? 16,
        duration: 850,
        essential: true,
      });
    } catch (e) {
      /* ignore map focus errors */
    }
  }, [focusPoint]);

  if (!mapboxToken) {
    return (
      <div className={className}>
        <div className="flex h-full min-h-80 flex-col items-center justify-center gap-3 rounded-xl bg-[#1a1a2e] px-6 text-center">
          <p className="text-sm font-medium text-foreground/60">Operations Map</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={mapContainerRef} id="map-container" className="h-full w-full" />
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
        <div className="rounded-full bg-blue-600/90 px-3 py-1 text-[11px] font-semibold text-white shadow">
          Stations {counts.station}
        </div>
        <div className="rounded-full bg-blue-600/90 px-3 py-1 text-[11px] font-semibold text-white shadow">
          Incidents {counts.incident}
        </div>
        <div className="rounded-full bg-blue-600/90 px-3 py-1 text-[11px] font-semibold text-white shadow">
          Vehicles {counts.vehicle}
        </div>
      </div>
    </div>
  );
}
