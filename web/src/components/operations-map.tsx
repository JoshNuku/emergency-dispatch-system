"use client";

import type mapboxgl from "mapbox-gl";
import { useEffect, useRef } from "react";

type MapPoint = {
	id: string;
	label: string;
	detail: string;
	latitude: number;
	longitude: number;
	tone: "incident" | "vehicle";
};

type OperationsMapProps = {
	points: MapPoint[];
	className?: string;
};

const defaultCenter: [number, number] = [-0.187, 5.651];

export function OperationsMap({ points, className }: OperationsMapProps) {
	const mapContainerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<mapboxgl.Map | null>(null);
	const mapboxRef = useRef<typeof mapboxgl | null>(null);
	const markersRef = useRef<mapboxgl.Marker[]>([]);

	useEffect(() => {
		const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
		if (!token || !mapContainerRef.current || mapRef.current) {
			return;
		}

		let isMounted = true;

		void (async () => {
			const mapboxModule = await import("mapbox-gl");
			if (!isMounted || !mapContainerRef.current) {
				return;
			}

			const mapboxgl = mapboxModule.default;
			mapboxgl.accessToken = token;
			mapboxRef.current = mapboxgl;
			mapRef.current = new mapboxgl.Map({
				container: mapContainerRef.current,
				style: "mapbox://styles/mapbox/dark-v11",
				center: defaultCenter,
				zoom: 13,
				pitch: 24,
			});

			mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");
		})();

		return () => {
			isMounted = false;
			markersRef.current.forEach((marker) => marker.remove());
			markersRef.current = [];
			if (mapRef.current) {
				mapRef.current.remove();
				mapRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		if (!mapRef.current || !mapboxRef.current) {
			return;
		}

		const map = mapRef.current;

		markersRef.current.forEach((marker) => marker.remove());
		markersRef.current = [];

		const mapboxgl = mapboxRef.current;
		const bounds = new mapboxgl.LngLatBounds();

		points.forEach((point) => {
			const markerElement = document.createElement("div");
			markerElement.style.width = point.tone === "incident" ? "16px" : "14px";
			markerElement.style.height = point.tone === "incident" ? "16px" : "14px";
			markerElement.style.borderRadius = "9999px";
			markerElement.style.border = "2px solid white";
			markerElement.style.boxShadow = "0 6px 18px rgba(0,0,0,0.16)";
			markerElement.style.background = point.tone === "incident" ? "#f24822" : "#14ae5c";

			const popup = new mapboxgl.Popup({ offset: 18 }).setHTML(
				`<div style="padding:6px 4px"><div style="font-weight:600;font-size:13px">${point.label}</div><div style="margin-top:4px;color:#8c8c8c;font-size:12px">${point.detail}</div></div>`,
			);

			const marker = new mapboxgl.Marker({ element: markerElement })
				.setLngLat([point.longitude, point.latitude])
				.setPopup(popup)
				.addTo(map);

			markersRef.current.push(marker);
			bounds.extend([point.longitude, point.latitude]);
		});

		if (points.length > 0) {
			map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 800 });
		} else {
			map.easeTo({ center: defaultCenter, zoom: 13, duration: 800 });
		}
	}, [points]);

	if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
		return (
			<div className={className}>
				<div className="flex h-full min-h-80 flex-col items-center justify-center gap-3 rounded-xl bg-[#1a1a2e] px-6 text-center">
					<svg viewBox="0 0 24 24" className="h-10 w-10 text-accent/50" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
						<path d="M12 21s6-4.35 6-10a6 6 0 10-12 0c0 5.65 6 10 6 10z" />
						<circle cx="12" cy="11" r="2.4" />
					</svg>
					<p className="text-sm font-medium text-foreground/60">Operations Map</p>
					<p className="max-w-xs text-xs text-muted">Set <code className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-accent/70">NEXT_PUBLIC_MAPBOX_TOKEN</code> in your environment to render the live map.</p>
				</div>
			</div>
		);
	}

	return <div ref={mapContainerRef} className={className} />;
}