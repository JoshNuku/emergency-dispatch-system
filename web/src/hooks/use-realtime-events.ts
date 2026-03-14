"use client";

import { useEffect, useState } from "react";

import type { RealtimeEvent } from "@/types/frontend";

export type { RealtimeEvent } from "@/types/frontend";

function parsePayload(payload: unknown) {
  if (typeof payload !== "string") {
    return payload;
  }

  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return payload;
  }
}

function normalizeWebSocketUrl(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8085";
  const url = new URL(baseUrl.includes("/ws") ? baseUrl : `${baseUrl}/ws`);
  url.searchParams.set("token", token);
  return url.toString();
}

export function useRealtimeEvents(token: string | null) {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }

    const socket = new WebSocket(normalizeWebSocketUrl(token));

    socket.onopen = () => {
      setIsConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as { type?: string; payload?: unknown };
        setEvents((current) => [
          {
            type: message.type ?? "unknown",
            payload: parsePayload(message.payload),
            receivedAt: new Date().toISOString(),
          },
          ...current,
        ].slice(0, 8));
      } catch {
        setEvents((current) => [
          {
            type: "unknown",
            payload: event.data,
            receivedAt: new Date().toISOString(),
          },
          ...current,
        ].slice(0, 8));
      }
    };

    socket.onerror = () => {
      setIsConnected(false);
    };

    socket.onclose = () => {
      setIsConnected(false);
    };

    return () => {
      socket.close();
    };
  }, [token]);

  return {
    events: token ? events : [],
    status: token ? (isConnected ? "live" : "connecting") : "offline",
  };
}
