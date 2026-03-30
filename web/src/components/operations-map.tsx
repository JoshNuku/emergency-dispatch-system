/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type mapboxgl from "mapbox-gl";
import { useCallback, useEffect, useRef } from "react";

type MapPoint = {
  id: string;
  label: string;
  detail: string;
  latitude: number;
  longitude: number;
  tone: "incident" | "vehicle" | "station";
  vehicle_type?: string;
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

const VEHICLE_ICONS: Record<string, string> = {
  "icon-ambulance": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48"><rect rx="2" ry="2" x="2" y="6" width="16" height="10" fill="#ffffff" stroke="#e11d48" stroke-width="1.5"/><rect x="6" y="9" width="6" height="6" fill="#e11d48" rx="0" /><rect x="18" y="9" width="4" height="6" fill="#111827" rx="1" /><circle cx="7" cy="17.5" r="1.5" fill="#111827" /><circle cx="13" cy="17.5" r="1.5" fill="#111827" /></svg>`,
  "icon-fire_truck": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48"><rect x="2" y="7" width="14" height="7" rx="1.5" fill="#ef4444" /><rect x="16" y="9" width="6" height="5" rx="1" fill="#111827" /><circle cx="6" cy="16.5" r="1.5" fill="#111827" /><circle cx="18" cy="16.5" r="1.5" fill="#111827" /><rect x="3" y="8.5" width="6" height="2" rx="0.5" fill="#fff" /></svg>`,
  "icon-police_car": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48"><rect x="2" y="8" width="16" height="6" rx="1.5" fill="#0ea5e9" /><rect x="18" y="9" width="4" height="4" rx="1" fill="#111827" /><circle cx="6" cy="15.5" r="1.5" fill="#111827" /><circle cx="14" cy="15.5" r="1.5" fill="#111827" /></svg>`,
  "icon-vehicle": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48"><rect x="2" y="8" width="16" height="6" rx="1.5" fill="#14ae5c" /><rect x="18" y="9" width="4" height="4" rx="1" fill="#111827" /><circle cx="6" cy="15.5" r="1.5" fill="#111827" /><circle cx="14" cy="15.5" r="1.5" fill="#111827" /></svg>`,
  "icon-station": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48"><path d="M3 20h18v1H3v-1z" fill="#fff"/><path d="M5 11v7h3v-4h8v4h3v-7L12 4 5 11z" fill="#2563eb"/><circle cx="9" cy="14" r="1" fill="#fff"/><circle cx="15" cy="14" r="1" fill="#fff"/></svg>`,
  "icon-incident": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" fill="#f24822"/></svg>`,
};

const TONE_COLOR: Record<string, string> = {
  incident: "#f24822",
  vehicle: "#14ae5c",
  station: "#2563eb",
};

function addSvgImageToMap(map: mapboxgl.Map, name: string, svg: string) {
  return new Promise<string | null>((resolve) => {
    if (!map || !map.getStyle()) {
      resolve(null);
      return;
    }
    if (map.hasImage(name)) {
      resolve(name);
      return;
    }
    try {
      const img = new Image();
      const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 48;
          canvas.height = 48;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            URL.revokeObjectURL(url);
            resolve(null);
            return;
          }
          ctx.clearRect(0, 0, 48, 48);
          ctx.drawImage(img, 0, 0, 48, 48);
          const imageData = ctx.getImageData(0, 0, 48, 48);
          if (!map.hasImage(name)) map.addImage(name, imageData);
          URL.revokeObjectURL(url);
          resolve(name);
        } catch (e) {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    } catch (e) {
      resolve(null);
    }
  });
}

function numberIsFinite(v: any) {
  return typeof v === "number" && isFinite(v);
}

export default function OperationsMap({ points, className, onMapClick, focusPoint }: OperationsMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapboxRef = useRef<typeof mapboxgl | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  const clearDomMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
  }, []);

  const createDomMarkersFromFeatures = useCallback((features: any[], missingIconNames?: Set<string>) => {
    const map = mapRef.current;
    if (!map || !mapboxRef.current) return;
    clearDomMarkers();
    for (const f of features) {
      try {
        const props = f.properties || {};
        const iconName = props.icon as string | undefined;
        // Only create DOM fallback markers for features that need them
        // If an icon is present and loaded, skip. If the icon is missing or there is no icon
        // we want a DOM fallback for stations, vehicles and incidents (labels).
        if (iconName && missingIconNames && !missingIconNames.has(iconName)) continue;
        if (!iconName && props.tone !== "station" && props.tone !== "vehicle" && props.tone !== "incident") continue;

        const coords = f.geometry.coordinates;
        const tone = String(props.tone || "vehicle");

        const container = document.createElement("div");
        container.className = "dom-marker flex items-center";
        container.style.display = "flex";
        container.style.alignItems = "center";

        const dot = document.createElement("div");
        dot.style.width = "12px";
        dot.style.height = "12px";
        dot.style.borderRadius = "50%";
        dot.style.boxShadow = "0 0 0 2px #fff";
        dot.style.background = TONE_COLOR[tone] || "#14ae5c";
        container.appendChild(dot);

        if ((props.tone === "station" || props.tone === "incident") && props.label) {
          const lbl = document.createElement("div");
          lbl.style.marginLeft = "8px";
          lbl.style.color = "#e6eef8";
          lbl.style.fontSize = "12px";
          lbl.style.fontWeight = "600";
          lbl.textContent = String(props.label || "");
          container.appendChild(lbl);
          if (props.detail) {
            const sub = document.createElement("div");
            sub.style.marginLeft = "8px";
            sub.style.color = "#9aa4b2";
            sub.style.fontSize = "11px";
            sub.textContent = String(props.detail || "");
            container.appendChild(sub);
          }
        }

        const marker = new (mapboxRef.current as any).Marker({ element: container }).setLngLat([coords[0], coords[1]]).addTo(map);
        markersRef.current.push(marker);
      } catch (e) {
        /* ignore individual marker failures */
      }
    }
  }, [clearDomMarkers]);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
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
          style: "mapbox://styles/mapbox/satellite-streets-v12",
          center: defaultCenter,
          zoom: 13,
          pitch: 24,
        });
        mapRef.current = map;

        map.on("load", () => {
          if (!isMounted) return;
          map?.resize();
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
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const mapboxglLocal = mapboxRef.current;
    if (!map || !mapboxglLocal) return;

    const sourceId = "operations-points";
    const features = (points || []).map((p) => {
      const vehicleIconName = p.vehicle_type ? `icon-${p.vehicle_type}` : "icon-vehicle";
      const resolvedIcon =
        p.tone === "vehicle"
          ? (Object.prototype.hasOwnProperty.call(VEHICLE_ICONS, vehicleIconName) ? vehicleIconName : "icon-vehicle")
          : p.tone === "station"
          ? "icon-station"
          : p.tone === "incident"
          ? "icon-incident"
          : "icon-vehicle";

      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [Number(p.longitude), Number(p.latitude)] },
        properties: {
          id: p.id,
          label: String(p.label || ""),
          detail: String(p.detail || ""),
          tone: p.tone,
          icon: resolvedIcon,
        },
      };
    }).filter((f) => {
      const c = (f.geometry as any).coordinates as number[];
      return Array.isArray(c) && numberIsFinite(c[1]) && Math.abs(c[1]) <= 90 && Math.abs(c[0]) <= 180;
    });

    const geojson = { type: "FeatureCollection" as const, features };

    const applyLayers = () => {
      try {
        if (!map.getStyle()) return;
        const source = map.getSource(sourceId) as any;
        if (source) {
          source.setData(geojson);
        } else {
          map.addSource(sourceId, {
            type: "geojson",
            data: geojson
          });

          map.addLayer({
            id: "unclustered-point",
            type: "circle",
            source: sourceId,
            filter: ["==", ["get", "tone"], "incident"],
            paint: {
              "circle-color": TONE_COLOR.incident,
              "circle-radius": 8,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#fff"
            }
          });

          if (!map.getLayer("vehicle-point")) {
            map.addLayer({
              id: "vehicle-point",
              type: "circle",
              source: sourceId,
              filter: ["==", ["get", "tone"], "vehicle"],
              paint: {
                "circle-color": TONE_COLOR.vehicle,
                "circle-radius": 7,
                "circle-stroke-width": 2,
                "circle-stroke-color": "#fff"
              }
            });
          }

          if (!map.getLayer("station-point")) {
            map.addLayer({
              id: "station-point",
              type: "circle",
              source: sourceId,
              filter: ["==", ["get", "tone"], "station"],
              paint: {
                "circle-color": TONE_COLOR.station,
                "circle-radius": 7,
                "circle-stroke-width": 2,
                "circle-stroke-color": "#fff"
              }
            });
          }
        }

        const mapAny = map as any;
        if (!mapAny.__opsMapClickHandlersBound) {
          const popupForLayer = (layerId: string, fallbackTitle: string, minWidthPx: number) => {
            map.on("click", layerId, (e) => {
              const feats = map.queryRenderedFeatures(e.point, { layers: [layerId] });
              if (!feats.length) return;
              const f = feats[0];
              const props = f.properties || {};
              const coords = (f.geometry as any)?.coordinates as number[];
              if (!coords) return;
              const html = `
                <div style="padding:6px 4px;min-width:${minWidthPx}px">
                  <div style="font-weight:700;font-size:13px;color:#ffffff">${escapeHtml(String(props.label || fallbackTitle))}</div>
                  <div style="margin-top:4px;color:#e0e0e0;font-size:12px">${escapeHtml(String(props.detail || ""))}</div>
                  <div style="margin-top:6px;font-size:11px;color:#d0d0d0">Lat ${coords[1].toFixed(5)}, Lng ${coords[0].toFixed(5)}</div>
                </div>
              `;
              new (mapboxglLocal as any).Popup({ offset: 18 }).setLngLat(coords).setHTML(html).addTo(map);
            });
            map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
            map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
          };

          popupForLayer("unclustered-point", "Incident", 200);
          popupForLayer("vehicle-point", "Unit", 180);
          popupForLayer("station-point", "Station", 180);
          mapAny.__opsMapClickHandlersBound = true;
        }

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
  }, [points, clearDomMarkers, createDomMarkersFromFeatures]);

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

  if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
    return (
      <div className={className}>
        <div className="flex h-full min-h-80 flex-col items-center justify-center gap-3 rounded-xl bg-[#1a1a2e] px-6 text-center">
          <p className="text-sm font-medium text-foreground/60">Operations Map</p>
        </div>
      </div>
    );
  }

  return <div ref={mapContainerRef} id="map-container" className={className} />;
}
