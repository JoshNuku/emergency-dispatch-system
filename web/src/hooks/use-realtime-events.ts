"use client";

import { useEffect, useState } from "react";

import type { RealtimeEvent } from "@/types/frontend";

export type { RealtimeEvent } from "@/types/frontend";

let hasWarnedMissingWsEnv = false;

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
  const envUrl = process.env.NEXT_PUBLIC_WS_URL?.trim();
  const isLocalHost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  const fallbackUrl = isLocalHost
    ? "ws://localhost:8085/ws"
    : "wss://eds-realtime-gateway.onrender.com/ws";
  const baseUrl = envUrl || fallbackUrl;
  if (!envUrl && typeof window !== "undefined" && !hasWarnedMissingWsEnv) {
    hasWarnedMissingWsEnv = true;
    console.warn(`Missing NEXT_PUBLIC_WS_URL; falling back to ${fallbackUrl}`);
  }
  const url = new URL(baseUrl.includes("/ws") ? baseUrl : `${baseUrl}/ws`);
  url.searchParams.set("token", token);
  return url.toString();
}

export function useRealtimeEvents(token: string | null) {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!token) return;

    let mounted = true;
    let socket: WebSocket | null = null;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const maxDelay = 30_000; // 30s

    const connect = () => {
      if (!mounted) return;
      try {
        socket = new WebSocket(normalizeWebSocketUrl(token));
      } catch {
        setIsConnected(false);
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        reconnectAttempts = 0;
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
          ].slice(0, 32));
        } catch {
          setEvents((current) => [
            {
              type: "unknown",
              payload: event.data,
              receivedAt: new Date().toISOString(),
            },
            ...current,
          ].slice(0, 32));
        }
      };

      socket.onerror = () => {
        setIsConnected(false);
      };

      socket.onclose = () => {
        setIsConnected(false);
        if (!mounted) return;
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), maxDelay);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        if (!mounted) return;
        connect();
      }, delay);
    };

    connect();

    return () => {
      mounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        if (socket) socket.close();
      } catch {}
    };
  }, [token]);

  return {
    events: token ? events : [],
    status: token ? (isConnected ? "live" : "connecting") : "offline",
  };
}
