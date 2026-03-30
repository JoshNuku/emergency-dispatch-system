"use client";

import type mapboxgl from "mapbox-gl";
import { useEffect, useRef } from "react";

type LocationPickerProps = {
  latitude: number;
  longitude: number;
  onLocationSelect: (lat: number, lng: number) => void;
  className?: string;
};

const defaultCenter: [number, number] = [-0.187, 5.651];

export function LocationPicker({ latitude, longitude, onLocationSelect, className }: LocationPickerProps) {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapboxRef = useRef<typeof mapboxgl | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const onLocationSelectRef = useRef(onLocationSelect);
  const suppressAutoCenterUntilRef = useRef(0);

  const suppressAutoCenter = (ms: number) => {
    suppressAutoCenterUntilRef.current = Math.max(
      suppressAutoCenterUntilRef.current,
      Date.now() + ms,
    );
  };

  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  useEffect(() => {
    const token = mapboxToken;
    if (!token || !mapContainerRef.current || mapRef.current) {
      return;
    }

    let isMounted = true;

    void (async () => {
      const mapboxModule = await import("mapbox-gl");
      if (!isMounted || !mapContainerRef.current) {
        return;
      }

      const mb = mapboxModule.default;
      mb.accessToken = token;
      mapboxRef.current = mb;

      const hasCoords = latitude !== 0 && longitude !== 0;
      const center: [number, number] = hasCoords ? [longitude, latitude] : defaultCenter;

      const map = new mb.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center,
        zoom: 14,
      });

      map.addControl(new mb.NavigationControl(), "top-right");
      mapRef.current = map;

      // Avoid force-centering while the user is actively interacting with the map.
      map.on("dragstart", () => suppressAutoCenter(1400));
      map.on("zoomstart", () => suppressAutoCenter(1400));
      map.on("rotatestart", () => suppressAutoCenter(1400));
      map.on("pitchstart", () => suppressAutoCenter(1400));

      // Place initial marker if coordinates already set
      if (hasCoords) {
        const el = createMarkerElement();
        markerRef.current = new mb.Marker({ element: el, draggable: true })
          .setLngLat([longitude, latitude])
          .addTo(map);

        markerRef.current.on("dragstart", () => suppressAutoCenter(2200));

        markerRef.current.on("dragend", () => {
          const pos = markerRef.current!.getLngLat();
          onLocationSelectRef.current(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
          suppressAutoCenter(1000);
        });
      }

      // Click to place/move marker
      map.on("click", (e) => {
        const { lng, lat } = e.lngLat;
        const roundedLat = Number(lat.toFixed(6));
        const roundedLng = Number(lng.toFixed(6));

        if (markerRef.current) {
          markerRef.current.setLngLat([roundedLng, roundedLat]);
        } else if (mapboxRef.current) {
          const el = createMarkerElement();
          markerRef.current = new mapboxRef.current.Marker({ element: el, draggable: true })
            .setLngLat([roundedLng, roundedLat])
            .addTo(map);

          markerRef.current.on("dragstart", () => suppressAutoCenter(2200));

          markerRef.current.on("dragend", () => {
            const pos = markerRef.current!.getLngLat();
            onLocationSelectRef.current(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
            suppressAutoCenter(1000);
          });
        }

        onLocationSelectRef.current(roundedLat, roundedLng);
        suppressAutoCenter(1000);
      });
    })();

    return () => {
      isMounted = false;
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const hasCoords = latitude !== 0 && longitude !== 0;
    if (!hasCoords) return;

    try {
      if (markerRef.current) {
        markerRef.current.setLngLat([longitude, latitude]);
      } else if (mapboxRef.current) {
        const el = createMarkerElement();
        markerRef.current = new mapboxRef.current.Marker({ element: el, draggable: true })
          .setLngLat([longitude, latitude])
          .addTo(map);

        markerRef.current.on("dragstart", () => suppressAutoCenter(2200));

        markerRef.current.on("dragend", () => {
          const pos = markerRef.current!.getLngLat();
          onLocationSelectRef.current(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
          suppressAutoCenter(1000);
        });
      }
      if (Date.now() > suppressAutoCenterUntilRef.current) {
        map.setCenter([longitude, latitude]);
      }
    } catch {
      /* ignore */
    }
  }, [latitude, longitude]);

  if (!mapboxToken) {
    return (
      <div className={className}>
        <div className="flex h-full min-h-44 flex-col items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] px-4 text-center">
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-accent/50" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21s6-4.35 6-10a6 6 0 10-12 0c0 5.65 6 10 6 10z" />
            <circle cx="12" cy="11" r="2.4" />
          </svg>
          <p className="text-xs text-muted">Set <code className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-accent/70">NEXT_PUBLIC_MAPBOX_TOKEN</code> to use the map picker.</p>
        </div>
      </div>
    );
  }

  return <div ref={mapContainerRef} className={className} />;
}

function createMarkerElement() {
  const el = document.createElement("div");
  el.style.width = "20px";
  el.style.height = "20px";
  el.style.borderRadius = "9999px";
  el.style.border = "3px solid white";
  el.style.background = "#f24822";
  el.style.boxShadow = "0 0 12px rgba(242, 72, 34, 0.5), 0 4px 12px rgba(0,0,0,0.3)";
  el.style.cursor = "grab";
  return el;
}
