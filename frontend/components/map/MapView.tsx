"use client";

import React, { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { Location, RouteOverlay, TrafficLevel } from "@/types/bus";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, Plus } from "lucide-react";

interface MapViewProps {
  center: Location;
  zoom?: number;
  routes?: RouteOverlay[];
  markers?: Array<{
    id: string;
    location: Location;
    type: "stop" | "bus" | "user";
    title?: string;
    routeId?: string;
    direction?: "outbound" | "inbound";
  }>;
  onMarkerClick?: (id: string, type: "stop" | "bus" | "user") => void;
}

type MapStatus = "loading" | "ready" | "fallback";

type LongdoLocation = {
  lat: number;
  lon: number;
};

const LONGDO_SCRIPT_ID = "longdo-map-sdk";
const LONGDO_LOAD_TIMEOUT_MS = 10000;
const LONGDO_ROUTE_CACHE_VERSION = 5;
const LONGDO_ROUTE_CACHE_KEY = `busbuddy.longdoRoutes.v${LONGDO_ROUTE_CACHE_VERSION}`;
const LONGDO_ROUTE_TYPE_ROAD_AND_TOLLWAY = 17;
const LONGDO_ROUTE_MODE = "c";
const BUS_ROUTE_SNAP_DISTANCE_METERS = 420;
const MAP_PAN_STEP_PX = 140;

let longdoScriptPromise: Promise<void> | null = null;
const routePathMemoryCache = new Map<string, Location[]>();
const routePathRequestCache = new Map<string, Promise<Location[]>>();

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    longdo?: any;
    handleMarkerClickFromLongdo?: (id: string, type: string) => void;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getMarkerColor(type: "stop" | "bus" | "user") {
  if (type === "bus") return "bg-blue-500";
  if (type === "user") return "bg-sky-700";
  return "bg-orange-500";
}

function getMarkerLabel(type: "stop" | "bus" | "user") {
  if (type === "bus") return "B";
  if (type === "user") return "Y";
  return "S";
}

function getRouteLineWidth(trafficLevel?: TrafficLevel) {
  if (trafficLevel === "severe") return 7;
  if (trafficLevel === "heavy") return 6;
  if (trafficLevel === "moderate") return 5;
  return 4;
}

function toLongdoLocation(location: Location): LongdoLocation {
  return {
    lat: location.lat,
    lon: location.lng,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  return "Map failed to initialize.";
}

function buildRouteCacheKey(route: RouteOverlay) {
  return [
    route.id,
    ...route.waypoints.map((point) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`),
  ].join("|");
}

function readRouteCache() {
  if (typeof window === "undefined") {
    return {} as Record<string, Location[]>;
  }

  try {
    const rawValue = window.localStorage.getItem(LONGDO_ROUTE_CACHE_KEY);

    if (!rawValue) {
      return {} as Record<string, Location[]>;
    }

    const parsedValue = JSON.parse(rawValue) as Record<string, Location[]>;
    return parsedValue && typeof parsedValue === "object" ? parsedValue : {};
  } catch {
    return {} as Record<string, Location[]>;
  }
}

function writeRouteCache(cache: Record<string, Location[]>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LONGDO_ROUTE_CACHE_KEY, JSON.stringify(cache));
}

function reversePath(path: Location[]) {
  return [...path].reverse();
}

function getMirroredSiblingOverlayId(routeId: string) {
  if (routeId.endsWith("-outbound")) {
    return `${routeId.slice(0, -"-outbound".length)}-inbound`;
  }

  if (routeId.endsWith("-inbound")) {
    return `${routeId.slice(0, -"-inbound".length)}-outbound`;
  }

  return null;
}

function getExactCachedRoutePath(route: RouteOverlay) {
  const cacheKey = buildRouteCacheKey(route);
  const memoryValue = routePathMemoryCache.get(cacheKey);

  if (memoryValue && memoryValue.length >= 2) {
    return memoryValue;
  }

  const persistedCache = readRouteCache();
  const persistedValue = persistedCache[cacheKey];

  if (persistedValue && persistedValue.length >= 2) {
    routePathMemoryCache.set(cacheKey, persistedValue);
    return persistedValue;
  }

  return null;
}

function getFallbackCachedRoutePath(route: RouteOverlay) {
  const exactPath = getExactCachedRoutePath(route);

  if (exactPath && exactPath.length >= 2) {
    return exactPath;
  }

  const siblingOverlayId = getMirroredSiblingOverlayId(route.id);

  if (!siblingOverlayId) {
    return null;
  }

  const siblingDirection =
    route.direction === "outbound" ? "inbound" : "outbound";
  const siblingRoute: RouteOverlay = {
    ...route,
    id: siblingOverlayId,
    direction: siblingDirection,
    waypoints: reversePath(route.waypoints),
  };
  const siblingPath = getExactCachedRoutePath(siblingRoute);

  return siblingPath && siblingPath.length >= 2 ? reversePath(siblingPath) : null;
}

function setCachedRoutePath(route: RouteOverlay, path: Location[]) {
  const cacheKey = buildRouteCacheKey(route);
  routePathMemoryCache.set(cacheKey, path);
  writeRouteCache({
    ...readRouteCache(),
    [cacheKey]: path,
  });
}

function areSamePoint(left: Location | undefined, right: Location | undefined) {
  if (!left || !right) {
    return false;
  }

  return (
    Math.abs(left.lat - right.lat) < 0.00001 &&
    Math.abs(left.lng - right.lng) < 0.00001
  );
}

function normalizeGeoJsonCoordinates(geometry: {
  type?: string;
  coordinates?: unknown;
}) {
  if (!geometry?.coordinates) {
    return [] as Location[];
  }

  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates
      .filter((coordinate): coordinate is [number, number] => Array.isArray(coordinate))
      .map(([lng, lat]) => ({ lat, lng }));
  }

  if (geometry.type === "MultiLineString" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.flatMap((segment) =>
      Array.isArray(segment)
        ? segment
            .filter((coordinate): coordinate is [number, number] => Array.isArray(coordinate))
            .map(([lng, lat]) => ({ lat, lng }))
        : [],
    );
  }

  return [] as Location[];
}

async function fetchRouteSegmentPath(
  apiKey: string,
  from: Location,
  to: Location,
  fallbackRouteMode?: string,
): Promise<Location[]> {
  const query = new URLSearchParams({
    flat: from.lat.toString(),
    flon: from.lng.toString(),
    tlat: to.lat.toString(),
    tlon: to.lng.toString(),
    mode: fallbackRouteMode ?? LONGDO_ROUTE_MODE,
    type: LONGDO_ROUTE_TYPE_ROAD_AND_TOLLWAY.toString(),
    locale: "en",
    key: apiKey,
  });

  try {
    const response = await fetch(`https://api.longdo.com/RouteService/geojson/route?${query}`);

    if (!response.ok) {
      if (!fallbackRouteMode) {
        return fetchRouteSegmentPath(apiKey, from, to, "w");
      }
      return [];
    }

    const payload = (await response.json()) as {
      features?: Array<{
        geometry?: {
          type?: string;
          coordinates?: unknown;
        };
      }>;
    };

    const coords = (payload.features ?? []).flatMap((feature) =>
      normalizeGeoJsonCoordinates(feature.geometry ?? {}),
    );

    if (coords.length < 2 && !fallbackRouteMode) {
      return fetchRouteSegmentPath(apiKey, from, to, "w");
    }

    return coords;
  } catch {
    if (!fallbackRouteMode) {
      return fetchRouteSegmentPath(apiKey, from, to, "w");
    }
    return [];
  }
}

async function fetchRoadPath(
  route: RouteOverlay,
  apiKey: string,
) {
  if (route.waypoints.length < 2) {
    return { path: [] as Location[], isComplete: false };
  }

  const combinedPath: Location[] = [];
  let isComplete = true;

  for (let index = 0; index < route.waypoints.length - 1; index += 1) {
    let segment = await fetchRouteSegmentPath(
      apiKey,
      route.waypoints[index],
      route.waypoints[index + 1],
    );

    if (segment.length < 2) {
      segment = [route.waypoints[index], route.waypoints[index + 1]];
      isComplete = false;
    }

    if (combinedPath.length === 0) {
      combinedPath.push(...segment);
      continue;
    }

    const dedupedSegment = areSamePoint(
      combinedPath[combinedPath.length - 1],
      segment[0],
    )
      ? segment.slice(1)
      : segment;

    combinedPath.push(...dedupedSegment);
  }

  return { path: combinedPath, isComplete };
}

function createRoadPolyline(
  longdo: any,
  route: RouteOverlay,
  path: Location[],
) {
  return new longdo.Polyline(
    path.map((point) => toLongdoLocation(point)),
    {
      lineColor: route.color,
      lineWidth: getRouteLineWidth(route.trafficLevel),
      lineStyle:
        route.direction === "inbound"
          ? longdo.LineStyle.Dashed
          : longdo.LineStyle.Solid,
    },
  );
}

function getRouteOverlayId(routeId?: string, direction?: "outbound" | "inbound") {
  if (!routeId || !direction) {
    return null;
  }

  return `${routeId}-${direction}`;
}

function getPreferredRoutePath(
  routePaths: Map<string, Location[]>,
  routeId?: string,
  direction?: "outbound" | "inbound",
) {
  const exactRouteId = getRouteOverlayId(routeId, direction);

  if (exactRouteId) {
    const exactPath = routePaths.get(exactRouteId);

    if (exactPath && exactPath.length >= 2) {
      return exactPath;
    }
  }

  if (!routeId) {
    return null;
  }

  const siblingPaths = [`${routeId}-outbound`, `${routeId}-inbound`]
    .map((candidateId) => routePaths.get(candidateId))
    .filter((candidatePath): candidatePath is Location[] => Boolean(candidatePath && candidatePath.length >= 2));

  return siblingPaths[0] ?? null;
}

function toMeterPoint(location: Location, referenceLatitude: number) {
  const latRadians = (referenceLatitude * Math.PI) / 180;

  return {
    x: location.lng * 111_320 * Math.cos(latRadians),
    y: location.lat * 110_540,
  };
}

function distanceBetweenInMeters(left: Location, right: Location) {
  const avgLatitude = (left.lat + right.lat) / 2;
  const leftPoint = toMeterPoint(left, avgLatitude);
  const rightPoint = toMeterPoint(right, avgLatitude);

  return Math.hypot(leftPoint.x - rightPoint.x, leftPoint.y - rightPoint.y);
}

function snapLocationToPath(
  location: Location,
  path: Location[],
  maxSnapDistanceMeters = BUS_ROUTE_SNAP_DISTANCE_METERS,
) {
  if (path.length < 2) {
    return location;
  }

  let nearestPoint = location;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    const referenceLatitude = (start.lat + end.lat + location.lat) / 3;
    const startPoint = toMeterPoint(start, referenceLatitude);
    const endPoint = toMeterPoint(end, referenceLatitude);
    const locationPoint = toMeterPoint(location, referenceLatitude);
    const deltaX = endPoint.x - startPoint.x;
    const deltaY = endPoint.y - startPoint.y;
    const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY;

    if (segmentLengthSquared === 0) {
      continue;
    }

    const projection = Math.max(
      0,
      Math.min(
        1,
        ((locationPoint.x - startPoint.x) * deltaX +
          (locationPoint.y - startPoint.y) * deltaY) /
          segmentLengthSquared,
      ),
    );

    const snappedPoint = {
      lat: start.lat + (end.lat - start.lat) * projection,
      lng: start.lng + (end.lng - start.lng) * projection,
    };
    const snappedDistance = distanceBetweenInMeters(location, snappedPoint);

    if (snappedDistance < nearestDistance) {
      nearestDistance = snappedDistance;
      nearestPoint = snappedPoint;
    }
  }

  return nearestDistance <= maxSnapDistanceMeters ? nearestPoint : location;
}

async function ensureRoadPath(route: RouteOverlay, apiKey: string) {
  const cachedPath = getExactCachedRoutePath(route);

  if (cachedPath && cachedPath.length >= 2) {
    return cachedPath;
  }

  const cacheKey = buildRouteCacheKey(route);
  const inflightRequest = routePathRequestCache.get(cacheKey);

  if (inflightRequest) {
    return inflightRequest;
  }

  const request = fetchRoadPath(route, apiKey)
    .then(({ path: roadPath, isComplete }) => {
      if (roadPath.length >= 2 && isComplete) {
        setCachedRoutePath(route, roadPath);
      }

      return roadPath;
    })
    .finally(() => {
      routePathRequestCache.delete(cacheKey);
    });

  routePathRequestCache.set(cacheKey, request);

  return request;
}

function loadLongdoScript(apiKey: string) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Map can only load in the browser."));
  }

  if (typeof window.longdo?.Map === "function") {
    return Promise.resolve();
  }

  if (longdoScriptPromise) {
    return longdoScriptPromise;
  }

  longdoScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(
      LONGDO_SCRIPT_ID,
    ) as HTMLScriptElement | null;
    const script = existingScript ?? document.createElement("script");

    const cleanup = () => {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };

    const timeoutId = window.setTimeout(() => {
      cleanup();
      longdoScriptPromise = null;
      reject(new Error("Map service timed out while loading."));
    }, LONGDO_LOAD_TIMEOUT_MS);

    const onLoad = () => {
      window.clearTimeout(timeoutId);
      cleanup();

      if (typeof window.longdo?.Map === "function") {
        resolve();
        return;
      }

      longdoScriptPromise = null;
      reject(new Error("Map service loaded, but the map API is unavailable."));
    };

    const onError = () => {
      window.clearTimeout(timeoutId);
      cleanup();
      longdoScriptPromise = null;
      reject(new Error("Unable to download the map service."));
    };

    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);

    if (!existingScript) {
      script.id = LONGDO_SCRIPT_ID;
      script.src = `https://api.longdo.com/map/?key=${apiKey}`;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return longdoScriptPromise;
}

export function MapView({
  center,
  zoom = 15,
  routes = [],
  markers = [],
  onMarkerClick,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const [mapError, setMapError] = useState<string | null>(null);
  const [routePathVersion, setRoutePathVersion] = useState(0);
  const [currentZoom, setCurrentZoom] = useState(zoom);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerOverlaysRef = useRef<Map<string, any>>(new Map());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routeOverlaysRef = useRef<Map<string, any>>(new Map());
  const routePathsRef = useRef<Map<string, Location[]>>(new Map());
  const onMarkerClickRef = useRef(onMarkerClick);
  const routeRenderVersionRef = useRef(0);

  useEffect(() => {
    onMarkerClickRef.current = onMarkerClick;
  }, [onMarkerClick]);

  useEffect(() => {
    window.handleMarkerClickFromLongdo = (id: string, type: string) => {
      onMarkerClickRef.current?.(id, type as "stop" | "bus" | "user");
    };

    return () => {
      delete window.handleMarkerClickFromLongdo;
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function initializeMap() {
      if (!mapContainerRef.current || mapInstanceRef.current) {
        return;
      }

      const apiKey = process.env.NEXT_PUBLIC_LONGDOMAP_KEY;

      if (!apiKey) {
        if (!disposed) {
          setMapStatus("fallback");
          setMapError("Map key is missing, so the live map cannot load.");
        }
        return;
      }

      try {
        await loadLongdoScript(apiKey);

        if (disposed || !mapContainerRef.current || mapInstanceRef.current) {
          return;
        }

        const map = new window.longdo.Map({
          placeholder: mapContainerRef.current,
          language: "en",
          lastView: false,
          smoothZoom: true,
          ui: window.longdo.UiComponent.None,
        });

        map.location(toLongdoLocation(center), true);
        map.zoom(zoom, true);
        setCurrentZoom(zoom);

        mapInstanceRef.current = map;
        setMapStatus("ready");
        setMapError(null);
      } catch (error) {
        if (!disposed) {
          setMapStatus("fallback");
          setMapError(getErrorMessage(error));
        }
      }
    }

    void initializeMap();

    return () => {
      disposed = true;
    };
  }, [center, zoom]);

  useEffect(() => {
    if (mapStatus !== "ready" || !mapInstanceRef.current) {
      return;
    }

    mapInstanceRef.current.location(toLongdoLocation(center), true);
    mapInstanceRef.current.zoom(zoom, true);
    setCurrentZoom(zoom);
  }, [center, zoom, mapStatus]);

  const handleZoomChange = useCallback((delta: number) => {
    if (mapStatus !== "ready" || !mapInstanceRef.current) {
      return;
    }

    const nextZoom = clamp(currentZoom + delta, 4, 20);
    mapInstanceRef.current.zoom(nextZoom, true);
    setCurrentZoom(nextZoom);
  }, [currentZoom, mapStatus]);

  const handlePan = useCallback((x: number, y: number) => {
    if (mapStatus !== "ready" || !mapInstanceRef.current) {
      return;
    }

    mapInstanceRef.current.move({ x, y }, true);
  }, [mapStatus]);

  useEffect(() => {
    if (mapStatus !== "ready" || !mapInstanceRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const map = mapInstanceRef.current;

    const visibleMarkerIds = new Set(markers.map((marker) => marker.id));

    Array.from(markerOverlaysRef.current.entries()).forEach(([markerId, overlay]) => {
      if (!visibleMarkerIds.has(markerId)) {
        map.Overlays.remove(overlay);
        markerOverlaysRef.current.delete(markerId);
      }
    });

    markers.forEach((m) => {
      const routePath = getPreferredRoutePath(
        routePathsRef.current,
        m.routeId,
        m.direction,
      );
      const snappedLocation =
        m.type === "bus" && routePath
          ? snapLocationToPath(
              m.location,
              routePath,
              Number.POSITIVE_INFINITY,
            )
          : m.location;
      let htmlString = "";

      // Convert Tailwind components to HTML strings for Longdo Map Custom Overlays
      if (m.type === "stop") {
        htmlString = `
          <div onclick="window.handleMarkerClickFromLongdo('${m.id}', '${m.type}')" 
               style="cursor: pointer; position: relative;">
            <div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background-color: #F26F22; color: white; border-radius: 50%; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: 2px solid white; font-size: 14px; font-weight: bold; position: absolute; transform: translate(-50%, -100%);">
              S
            </div>
          </div>
        `;
      } else if (m.type === "bus") {
        htmlString = `
          <div onclick="window.handleMarkerClickFromLongdo('${m.id}', '${m.type}')" 
               style="cursor: pointer; position: relative;">
            <div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background-color: #3B82F6; color: white; border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: 2px solid white; font-size: 16px; position: absolute; transform: translate(-50%, -100%); transition: all 0.3s ease;">
              🚌
            </div>
            ${m.title ? `<div style="position: absolute; transform: translate(-50%, 8px); background: white; padding: 2px 6px; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); font-size: 10px; font-weight: 600; font-family: ui-sans-serif, system-ui, sans-serif; white-space: nowrap; color: #111827;">Route ${m.title}</div>` : ""}
          </div>
        `;
      } else if (m.type === "user") {
        htmlString = `
          <div onclick="window.handleMarkerClickFromLongdo('${m.id}', '${m.type}')"
               style="cursor: pointer; position: relative;">
            <div style="width: 20px; height: 20px; background-color: #2563EB; border-radius: 50%; box-shadow: 0 0 0 4px rgba(37,99,235,0.3); border: 3px solid white; position: absolute; transform: translate(-50%, -50%);"></div>
          </div>
        `;
      }

      const existingMarker = markerOverlaysRef.current.get(m.id);

      if (existingMarker) {
        existingMarker.move(toLongdoLocation(snappedLocation), m.type === "bus");
        return;
      }

      const marker = new w.longdo.Marker(toLongdoLocation(snappedLocation), {
        title: m.title,
        icon: { html: htmlString, offset: { x: 0, y: 0 } },
        detail: m.id,
      });

      map.Overlays.add(marker);
      markerOverlaysRef.current.set(m.id, marker);
    });
  }, [markers, mapStatus, routePathVersion]);

  useEffect(() => {
    if (mapStatus !== "ready" || !mapInstanceRef.current) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const map = mapInstanceRef.current;
    const visibleRouteIds = new Set(routes.map((route) => route.id));

    Array.from(routeOverlaysRef.current.entries()).forEach(([routeId, overlay]) => {
      if (!visibleRouteIds.has(routeId)) {
        map.Overlays.remove(overlay);
        routeOverlaysRef.current.delete(routeId);
        routePathsRef.current.delete(routeId);
      }
    });

    function replaceRouteOverlay(route: RouteOverlay, path: Location[]) {
      const existingOverlay = routeOverlaysRef.current.get(route.id);

      if (existingOverlay) {
        map.Overlays.remove(existingOverlay);
      }

      const overlay = createRoadPolyline(w.longdo, route, path);
      map.Overlays.add(overlay);
      routeOverlaysRef.current.set(route.id, overlay);
      routePathsRef.current.set(route.id, path);
      startTransition(() => {
        setRoutePathVersion((currentVersion) => currentVersion + 1);
      });
    }

    routes.forEach((route) => {
      if (route.waypoints.length >= 2) {
        replaceRouteOverlay(route, route.waypoints);
      }
    });
  }, [mapStatus, routes]);

  useEffect(() => {
    return () => {
      if (!mapInstanceRef.current) {
        return;
      }

      markerOverlaysRef.current.forEach((overlay) => {
        mapInstanceRef.current.Overlays.remove(overlay);
      });
      markerOverlaysRef.current.clear();
      routeOverlaysRef.current.forEach((overlay) => {
        mapInstanceRef.current.Overlays.remove(overlay);
      });
      routeOverlaysRef.current.clear();
      routePathsRef.current.clear();
    };
  }, []);

  const allPoints = [center, ...markers.map((marker) => marker.location)];
  const latitudes = allPoints.map((point) => point.lat);
  const longitudes = allPoints.map((point) => point.lng);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latSpan = Math.max(maxLat - minLat, 0.01);
  const lngSpan = Math.max(maxLng - minLng, 0.01);

  return (
    <div className="relative w-full h-full bg-[#E5E3DF]">
      {/* The DOM element Longdo will inject canvas into */}
      <div 
        ref={mapContainerRef} 
        className="w-full h-full outline-none" 
        style={{ touchAction: 'none' }} // Good for mobile map drag
      />

      {mapStatus === "fallback" && (
        <div className="absolute inset-0 z-10 overflow-hidden bg-slate-100">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(226,232,240,0.9)_55%,_rgba(203,213,225,0.95))]" />
          <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,rgba(148,163,184,0.25)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.25)_1px,transparent_1px)] [background-size:32px_32px]" />
          <div className="absolute inset-0">
            {routes.slice(0, 6).map((route) => (
              <div
                key={route.id}
                className="absolute left-4 right-4 h-px opacity-40"
                style={{
                  top: `${18 + (parseInt(route.id.replace(/\D/g, "").slice(-2), 10) % 60)}%`,
                  backgroundColor: route.color,
                }}
              />
            ))}
            {markers.map((marker) => {
              const left = clamp(
                ((marker.location.lng - minLng) / lngSpan) * 100,
                8,
                92,
              );
              const top = clamp(
                (1 - (marker.location.lat - minLat) / latSpan) * 100,
                10,
                90,
              );

              return (
                <button
                  key={marker.id}
                  type="button"
                  onClick={() => onMarkerClick?.(marker.id, marker.type)}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${left}%`, top: `${top}%` }}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-lg ${getMarkerColor(marker.type)}`}
                  >
                    {getMarkerLabel(marker.type)}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="absolute left-4 top-4 max-w-xs rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-lg backdrop-blur">
            <p className="text-sm font-semibold text-slate-900">Preview Map</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {mapError ?? "The live map is unavailable right now, so a preview is shown instead."}
            </p>
          </div>
        </div>
      )}

      {mapStatus === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
          <div className="flex flex-col items-center">
            <span className="w-8 h-8 border-4 border-brand border-t-transparent flex-[0_0_auto] rounded-full animate-spin mb-4" />
            <span className="text-sm font-medium text-gray-500">Loading Map...</span>
          </div>
        </div>
      )}

      {mapStatus === "ready" && (
        <div className="absolute left-4 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-3">
          <div className="grid h-[112px] w-[112px] grid-cols-3 grid-rows-3 rounded-[28px] border border-white/80 bg-white/92 p-2 shadow-[0_18px_45px_rgba(15,23,42,0.16)] backdrop-blur">
            <span />
            <button
              type="button"
              aria-label="Move map up"
              onClick={() => handlePan(0, -MAP_PAN_STEP_PX)}
              className="flex h-10 w-10 items-center justify-center self-center justify-self-center rounded-2xl text-[#F26F22] transition hover:bg-[#FFF4EC] active:bg-[#FFE6D6]"
            >
              <ChevronUp className="h-5 w-5" />
            </button>
            <span />
            <button
              type="button"
              aria-label="Move map left"
              onClick={() => handlePan(-MAP_PAN_STEP_PX, 0)}
              className="flex h-10 w-10 items-center justify-center self-center justify-self-center rounded-2xl text-[#F26F22] transition hover:bg-[#FFF4EC] active:bg-[#FFE6D6]"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center self-center justify-self-center rounded-2xl bg-[#FFF4EC] text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F26F22]">
              Map
            </div>
            <button
              type="button"
              aria-label="Move map right"
              onClick={() => handlePan(MAP_PAN_STEP_PX, 0)}
              className="flex h-10 w-10 items-center justify-center self-center justify-self-center rounded-2xl text-[#F26F22] transition hover:bg-[#FFF4EC] active:bg-[#FFE6D6]"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <span />
            <button
              type="button"
              aria-label="Move map down"
              onClick={() => handlePan(0, MAP_PAN_STEP_PX)}
              className="flex h-10 w-10 items-center justify-center self-center justify-self-center rounded-2xl text-[#F26F22] transition hover:bg-[#FFF4EC] active:bg-[#FFE6D6]"
            >
              <ChevronDown className="h-5 w-5" />
            </button>
            <span />
          </div>

          <div className="flex flex-col overflow-hidden rounded-[22px] border border-white/80 bg-white/92 shadow-[0_18px_45px_rgba(15,23,42,0.16)] backdrop-blur">
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => handleZoomChange(1)}
              className="flex h-12 w-12 items-center justify-center text-[#F26F22] transition hover:bg-[#FFF4EC] active:bg-[#FFE6D6]"
            >
              <Plus className="h-5 w-5" />
            </button>
            <div className="mx-3 h-px bg-[#F3D5C0]" />
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => handleZoomChange(-1)}
              className="flex h-12 w-12 items-center justify-center text-[#F26F22] transition hover:bg-[#FFF4EC] active:bg-[#FFE6D6]"
            >
              <Minus className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
