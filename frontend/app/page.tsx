"use client";

import React, {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppHeader } from "@/components/navigation/AppHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { MapView } from "@/components/map/MapView";
import { StopCard } from "@/components/stops/StopCard";
import { StopDetailSheet } from "@/components/stops/StopDetailSheet";
import { BusDetailSheet } from "@/components/buses/BusDetailSheet";
import { UserAssistantPanel } from "@/components/ai/UserAssistantPanel";
import { StopCardSkeleton } from "@/components/ui/LoadingSkeleton";
import { useStops } from "@/hooks/useStops";
import { useLiveBuses } from "@/hooks/useLiveBuses";
import { useRoutes } from "@/hooks/useRoutes";
import { getStopCrowding } from "@/services/insights";
import { Bus, Direction, Location, RouteOverlay, Stop } from "@/types/bus";
import { StopCrowdingRecord } from "@/types/insights";
import { LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const DEFAULT_BANGKOK_CENTER: Location = { lat: 13.7457, lng: 100.5347 };
const NEARBY_STOP_RADIUS_METERS = 1200;
const DEFAULT_MAP_ZOOM = 13;
const USER_LOCATION_ZOOM = 15;

export default function HomePage() {
  const { t } = useLanguage();
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [mapCenter, setMapCenter] = useState<Location>(DEFAULT_BANGKOK_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_MAP_ZOOM);
  const [isResolvingLocation, setIsResolvingLocation] = useState(true);
  const [isUsingFallbackLocation, setIsUsingFallbackLocation] = useState(false);
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [selectedRouteIds, setSelectedRouteIds] = useState<string[]>([]);
  const [stopCrowding, setStopCrowding] = useState<StopCrowdingRecord[]>([]);
  const { stops, isLoading: isLoadingStops } = useStops(userLocation, NEARBY_STOP_RADIUS_METERS);
  const { buses } = useLiveBuses();
  const { routes } = useRoutes();
  const latestRoutesRef = useRef(routes);
  latestRoutesRef.current = routes;
  const selectedRouteIdSet = useMemo(() => new Set(selectedRouteIds), [selectedRouteIds]);
  const routeFilters = useMemo(
    () =>
      routes
        .map((route) => ({
          id: route.id,
          routeNumber: route.routeNumber,
          color: route.color ?? "#F26F22",
        }))
        .toSorted((left, right) => left.routeNumber.localeCompare(right.routeNumber)),
    [routes],
  );
  const filteredStops = useMemo(
    () =>
      selectedRouteIdSet.size === 0
        ? stops
        : stops.filter((stop) =>
            stop.routeIds?.some((routeId) => selectedRouteIdSet.has(routeId)),
          ),
    [selectedRouteIdSet, stops],
  );
  const filteredBuses = useMemo(
    () =>
      selectedRouteIdSet.size === 0
        ? buses
        : buses.filter((bus) => selectedRouteIdSet.has(bus.routeId)),
    [buses, selectedRouteIdSet],
  );
  const selectedBus = useMemo<Bus | null>(
    () => filteredBuses.find((bus) => bus.id === selectedBusId) ?? null,
    [filteredBuses, selectedBusId],
  );
  const stopCrowdingById = useMemo(
    () => new Map(stopCrowding.map((record) => [record.stopId, record])),
    [stopCrowding],
  );

  const requestCurrentLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setUserLocation(DEFAULT_BANGKOK_CENTER);
      setMapCenter(DEFAULT_BANGKOK_CENTER);
      setMapZoom(DEFAULT_MAP_ZOOM);
      setIsUsingFallbackLocation(true);
      setIsResolvingLocation(false);
      return;
    }

    setIsResolvingLocation(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setUserLocation(nextLocation);
        setMapCenter(nextLocation);
        setMapZoom(USER_LOCATION_ZOOM);
        setIsUsingFallbackLocation(false);
        setIsResolvingLocation(false);
      },
      () => {
        setUserLocation(DEFAULT_BANGKOK_CENTER);
        setMapCenter(DEFAULT_BANGKOK_CENTER);
        setMapZoom(DEFAULT_MAP_ZOOM);
        setIsUsingFallbackLocation(true);
        setIsResolvingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      },
    );
  }, []);

  useEffect(() => {
    requestCurrentLocation();
  }, [requestCurrentLocation]);

  useEffect(() => {
    let isMounted = true;

    async function loadInsights() {
      const crowding = userLocation
        ? await getStopCrowding({ lat: userLocation.lat, lng: userLocation.lng, radius: 1800 })
        : await getStopCrowding();

      if (isMounted) {
        setStopCrowding(crowding);
      }
    }

    void loadInsights().catch(() => {
      if (isMounted) {
        setStopCrowding([]);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [userLocation]);

  const toggleRouteFilter = useCallback((routeId: string) => {
    startTransition(() => {
      setSelectedRouteIds((currentRouteIds) =>
        currentRouteIds.includes(routeId)
          ? currentRouteIds.filter((currentRouteId) => currentRouteId !== routeId)
          : [...currentRouteIds, routeId].toSorted((left, right) =>
              left.localeCompare(right),
            ),
      );
    });
  }, []);

  const clearRouteFilters = useCallback(() => {
    startTransition(() => {
      setSelectedRouteIds([]);
    });
  }, []);

  useEffect(() => {
    if (selectedStop && !filteredStops.some((stop) => stop.id === selectedStop.id)) {
      setSelectedStop(null);
    }
  }, [filteredStops, selectedStop]);

  useEffect(() => {
    if (selectedBusId && !filteredBuses.some((bus) => bus.id === selectedBusId)) {
      setSelectedBusId(null);
    }
  }, [filteredBuses, selectedBusId]);

  // Map markers preparation
  const markers = [
    ...(userLocation
      ? [{ id: "user", location: userLocation, type: "user" as const, title: "You" }]
      : []),
    ...filteredStops.map(s => ({ id: s.id, location: s.location, type: "stop" as const, title: s.name })),
    ...filteredBuses.map(b => ({
      id: b.id,
      location: b.location,
      type: "bus" as const,
      title: b.routeNumber ?? b.routeId,
      routeId: b.routeId,
      direction: b.direction,
    }))
  ];

  const visibleRouteKey = (
    selectedRouteIdSet.size > 0
      ? selectedRouteIds
      : Array.from(
          new Set([
            ...filteredStops.flatMap((stop) => stop.routeIds ?? []),
            ...filteredBuses.map((bus) => bus.routeId),
          ]),
        )
  )
    .slice()
    .sort()
    .join("|");

  const routeGeometryKey = routes
    .map(
      (route) =>
        `${route.id}:${route.color ?? ""}:${route.directions.outbound.polyline
          .map((point) => `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`)
          .join(",")}:${route.directions.inbound.polyline
          .map((point) => `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`)
          .join(",")}`,
    )
    .sort()
    .join("|");

  const routeGeometrySnapshot = useMemo(
    () =>
      latestRoutesRef.current.map((route) => ({
        id: route.id,
        routeNumber: route.routeNumber,
        color: route.color ?? "#F26F22",
        directions: {
          outbound: route.directions.outbound.polyline,
          inbound: route.directions.inbound.polyline,
        },
      })),
    [routeGeometryKey],
  );

  const routeOverlays: RouteOverlay[] = useMemo(() => {
    const visibleRouteIds = new Set(visibleRouteKey ? visibleRouteKey.split("|") : []);

    return routeGeometrySnapshot.flatMap((route) => {
      if (!visibleRouteIds.has(route.id)) {
        return [];
      }

      return (["outbound", "inbound"] as Direction[]).map((direction) => ({
        id: `${route.id}-${direction}`,
        label: `${route.routeNumber} ${direction}`,
        color: route.color,
        direction,
        waypoints: route.directions[direction],
      }));
    });
  }, [routeGeometrySnapshot, visibleRouteKey]);

  const handleMarkerClick = (id: string, type: "stop" | "bus" | "user") => {
    if (type === "stop") {
      const stop = filteredStops.find(s => s.id === id);
      if (stop) {
        setSelectedBusId(null);
        setSelectedStop(stop);
      }
      return;
    }

    if (type === "bus") {
      setSelectedStop(null);
      setSelectedBusId(id);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-white overflow-hidden">
      <AppHeader />
      
      <div className="flex flex-1 pt-[60px] relative w-full h-full">
        <BottomNav />
        
        {/* Main Content Layout */}
        <div className="flex-1 flex flex-col md:flex-row relative w-full h-full md:pl-24">
          
          {/* Map Section */}
          <div className="w-full h-[38%] sm:h-[45%] md:h-full md:flex-1 relative order-1 md:order-2 z-0">
            <MapView 
              center={mapCenter}
              zoom={mapZoom}
              routes={routeOverlays}
              markers={markers} 
              onMarkerClick={handleMarkerClick}
            />
            {/* Current Location Button Overlay */}
            <div className="absolute bottom-4 right-4 md:bottom-8 md:right-8 z-10">
              <Button
                variant="outline"
                size="icon"
                isLoading={isResolvingLocation}
                onClick={requestCurrentLocation}
                className="rounded-full shadow-xl h-12 w-12 bg-white/90 backdrop-blur border-gray-200"
              >
                <LocateFixed className="h-6 w-6 text-brand" />
              </Button>
            </div>
          </div>

          {/* Nearby Stops List Section */}
          <div className="w-full h-[62%] sm:h-[55%] md:h-full md:w-[400px] lg:w-[450px] flex flex-col bg-white shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.1)] md:shadow-[10px_0_20px_-10px_rgba(0,0,0,0.1)] order-2 md:order-1 z-20 md:z-10 rounded-t-3xl md:rounded-t-none pb-[80px] md:pb-0">
            <div className="p-3 sm:p-4 md:p-6 bg-white border-b border-gray-100 flex-none rounded-t-3xl md:rounded-t-none">
              <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-4 md:hidden" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 px-2 lg:px-0 mt-2 md:mt-0">{t("home.nearbyStops")}</h2>
              <p className="text-sm text-gray-500 px-2 lg:px-0 mt-1">{t("home.walkingDistance")}</p>
              <div className="mt-4 flex gap-2 overflow-x-auto px-2 pb-1 lg:px-0">
                <button
                  type="button"
                  onClick={clearRouteFilters}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    selectedRouteIdSet.size === 0
                      ? "border-brand bg-brand text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {t("common.allRoutes")}
                </button>
                {routeFilters.map((route) => {
                  const isActive = selectedRouteIdSet.has(route.id);

                  return (
                    <button
                      key={route.id}
                      type="button"
                      onClick={() => toggleRouteFilter(route.id)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        isActive
                          ? "text-white"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                      style={
                        isActive
                          ? {
                              backgroundColor: route.color,
                              borderColor: route.color,
                            }
                          : undefined
                      }
                    >
                      {t("home.routeChip", { routeNumber: route.routeNumber })}
                    </button>
                  );
                })}
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-3">
               {isResolvingLocation || isLoadingStops ? (
                 <>
                   <StopCardSkeleton />
                   <StopCardSkeleton />
                   <StopCardSkeleton />
                   <StopCardSkeleton />
                 </>
               ) : (
                 filteredStops.map((stop, index) => (
                   <StopCard 
                     key={stop.id} 
                     stop={stop} 
                     isNearest={index === 0 && !isUsingFallbackLocation}
                     crowding={stopCrowdingById.get(stop.id)}
                     onClick={(stop) => {
                       setSelectedBusId(null);
                       setSelectedStop(stop);
                     }} 
                   />
                 ))
               )}
            </div>
          </div>

          {/* Selected Stop Details Bottom Sheet / Side Panel Overlay */}
          {selectedStop && (
            <StopDetailSheet 
              stop={selectedStop} 
              crowding={stopCrowdingById.get(selectedStop.id)}
              onClose={() => setSelectedStop(null)} 
            />
          )}

          {selectedBus && (
            <BusDetailSheet
              bus={selectedBus}
              onClose={() => setSelectedBusId(null)}
            />
          )}

          <UserAssistantPanel
            userLocation={userLocation}
            selectedStop={selectedStop}
            selectedRouteIds={selectedRouteIds}
          />

        </div>
      </div>
    </div>
  );
}
