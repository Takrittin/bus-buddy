"use client";

import { getApiBaseUrl } from "@/lib/api-client";
import {
  ApiBusLocationSocketEvent,
  ApiEtaResponse,
  ApiRouteStatusSocketEvent,
} from "@/services/transit-adapters";
import { io, Socket } from "socket.io-client";

let transitSocket: Socket | null = null;
let hasBoundErrorLogger = false;

function getTransitSocket() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!transitSocket) {
    transitSocket = io(getApiBaseUrl(), {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
  }

  if (transitSocket && !hasBoundErrorLogger) {
    transitSocket.on("connect_error", (error) => {
      console.error("BusBuddy socket connection failed:", error.message);
    });
    hasBoundErrorLogger = true;
  }

  return transitSocket;
}

export function subscribeToBusLocationUpdates(
  handler: (payload: ApiBusLocationSocketEvent) => void,
) {
  const socket = getTransitSocket();

  if (!socket) {
    return () => undefined;
  }

  socket.on("bus_location_update", handler);

  return () => {
    socket.off("bus_location_update", handler);
  };
}

export function subscribeToEtaUpdates(handler: (payload: ApiEtaResponse) => void) {
  const socket = getTransitSocket();

  if (!socket) {
    return () => undefined;
  }

  socket.on("eta_update", handler);

  return () => {
    socket.off("eta_update", handler);
  };
}

export function subscribeToRouteStatusUpdates(
  handler: (payload: ApiRouteStatusSocketEvent) => void,
) {
  const socket = getTransitSocket();

  if (!socket) {
    return () => undefined;
  }

  socket.on("route_status_update", handler);

  return () => {
    socket.off("route_status_update", handler);
  };
}
