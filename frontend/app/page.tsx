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
import { clearTripPreview, readTripPreview, TripPreview } from "@/lib/trip-preview";
import { getStopCrowding } from "@/services/insights";
import { Bus, Direction, Location, RouteOverlay, Stop } from "@/types/bus";
import { StopCrowdingRecord, TripPlanOption } from "@/types/insights";
import { BusFront, LocateFixed, MapPin, Navigation, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const DEFAULT_BANGKOK_CENTER: Location = { lat: 13.7457, lng: 100.5347 };
const NEARBY_STOP_RADIUS_METERS = 1200;
const DEFAULT_MAP_ZOOM = 13;
const USER_LOCATION_ZOOM = 15;
const TRIP_PREVIEW_ZOOM = 12;

function distanceInMeters(from: Location, to: Location) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(a));
}

function getPreviewCenter(preview: TripPreview) {
  const points = [
    preview.originLocation,
    preview.destinationLocation,
    ...preview.plan.legs.flatMap((leg) => [
      leg.boardingStop.location,
      leg.alightingStop.location,
    ]),
  ];

  return {
    lat: points.reduce((total, point) => total + point.lat, 0) / points.length,
    lng: points.reduce((total, point) => total + point.lng, 0) / points.length,
  };
}

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
  const [isNearbySheetExpanded, setIsNearbySheetExpanded] = useState(false);
  const nearbySheetTouchStartY = useRef<number | null>(null);
  const [tripPreview, setTripPreview] = useState<TripPreview | null>(null);
  const tripPreviewRef = useRef<TripPreview | null>(null);
  const [stopCrowding, setStopCrowding] = useState<StopCrowdingRecord[]>([]);
  const { stops, isLoading: isLoadingStops } = useStops(userLocation, NEARBY_STOP_RADIUS_METERS);
  const { buses } = useLiveBuses();
  const { routes } = useRoutes();
  const latestRoutesRef = useRef(routes);
  latestRoutesRef.current = routes;
  tripPreviewRef.current = tripPreview;
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
      tripPreview
        ? buses.filter((bus) =>
            tripPreview.plan.legs.some((leg) => leg.routeId === bus.routeId),
          )
        : selectedRouteIdSet.size === 0
        ? buses
        : buses.filter((bus) => selectedRouteIdSet.has(bus.routeId)),
    [buses, selectedRouteIdSet, tripPreview],
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
        if (!tripPreviewRef.current) {
          setMapCenter(nextLocation);
          setMapZoom(USER_LOCATION_ZOOM);
        }
        setIsUsingFallbackLocation(false);
        setIsResolvingLocation(false);
      },
      () => {
        setUserLocation(DEFAULT_BANGKOK_CENTER);
        if (!tripPreviewRef.current) {
          setMapCenter(DEFAULT_BANGKOK_CENTER);
          setMapZoom(DEFAULT_MAP_ZOOM);
        }
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
    const storedTripPreview = readTripPreview();

    if (!storedTripPreview) {
      return;
    }

    setTripPreview(storedTripPreview);
    setMapCenter(getPreviewCenter(storedTripPreview));
    setMapZoom(TRIP_PREVIEW_ZOOM);
    setIsNearbySheetExpanded(false);
  }, []);

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

  const tripPreviewMarkers = useMemo(() => {
    if (!tripPreview) {
      return [];
    }

    const firstLeg = tripPreview.plan.legs[0];
    const lastLeg = tripPreview.plan.legs[tripPreview.plan.legs.length - 1];

    return [
      {
        id: "trip-origin",
        location: tripPreview.originLocation,
        type: "trip_origin" as const,
        title: tripPreview.originLabel,
      },
      ...(firstLeg
        ? [
            {
              id: "trip-board",
              location: firstLeg.boardingStop.location,
              type: "trip_board" as const,
              title: firstLeg.boardingStop.stopName,
            },
          ]
        : []),
      ...tripPreview.plan.legs.slice(0, -1).map((leg, index) => ({
        id: `trip-transfer-${index}`,
        location: leg.alightingStop.location,
        type: "trip_transfer" as const,
        title: leg.alightingStop.stopName,
      })),
      ...(lastLeg
        ? [
            {
              id: "trip-alight",
              location: lastLeg.alightingStop.location,
              type: "trip_alight" as const,
              title: lastLeg.alightingStop.stopName,
            },
          ]
        : []),
      {
        id: "trip-destination",
        location: tripPreview.destinationLocation,
        type: "trip_destination" as const,
        title: tripPreview.destinationLabel,
      },
    ];
  }, [tripPreview]);

  const markers = [
    ...(tripPreview
      ? tripPreviewMarkers
      : userLocation
        ? [{ id: "user", location: userLocation, type: "user" as const, title: "You" }]
        : []),
    ...(tripPreview
      ? []
      : filteredStops.map(s => ({ id: s.id, location: s.location, type: "stop" as const, title: s.name }))),
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

  const tripPreviewOverlays: RouteOverlay[] = useMemo(() => {
    if (!tripPreview) {
      return [];
    }

    const overlays: RouteOverlay[] = [];
    const firstLeg = tripPreview.plan.legs[0];
    const lastLeg = tripPreview.plan.legs[tripPreview.plan.legs.length - 1];

    if (firstLeg && distanceInMeters(tripPreview.originLocation, firstLeg.boardingStop.location) > 20) {
      overlays.push({
        id: "trip-walk-start",
        label: t("home.walkToStop"),
        color: "#94A3B8",
        direction: "outbound",
        waypoints: [tripPreview.originLocation, firstLeg.boardingStop.location],
        lineStyle: "dashed",
        lineWidth: 3,
      });
    }

    const usedRouteOverlays = new Map<string, RouteOverlay>();

    tripPreview.plan.legs.forEach((leg, index) => {
      const route = routeGeometrySnapshot.find((candidate) => candidate.id === leg.routeId);
      const waypoints = route?.directions[leg.direction] ?? [];

      if (waypoints.length < 2) {
        return;
      }

      const overlayId = `${leg.routeId}-${leg.direction}`;

      if (usedRouteOverlays.has(overlayId)) {
        return;
      }

      usedRouteOverlays.set(overlayId, {
        id: overlayId,
        label: `${leg.routeNumber} ${leg.direction}`,
        color: route?.color ?? (index === 0 ? "#F26F22" : "#2563EB"),
        direction: leg.direction,
        waypoints,
        lineStyle: "solid",
        lineWidth: 8,
        clipTo: {
          from: leg.boardingStop.location,
          to: leg.alightingStop.location,
        },
      });
    });

    overlays.push(...Array.from(usedRouteOverlays.values()));

    if (lastLeg && distanceInMeters(lastLeg.alightingStop.location, tripPreview.destinationLocation) > 20) {
      overlays.push({
        id: "trip-walk-end",
        label: t("home.walkToDestination"),
        color: "#94A3B8",
        direction: "outbound",
        waypoints: [lastLeg.alightingStop.location, tripPreview.destinationLocation],
        lineStyle: "dashed",
        lineWidth: 3,
      });
    }

    return overlays;
  }, [routeGeometrySnapshot, t, tripPreview]);

  const visibleRouteOverlays = tripPreview ? tripPreviewOverlays : routeOverlays;

  const handleMarkerClick = (id: string, type: string) => {
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

  const handleClearTripPreview = () => {
    clearTripPreview();
    setTripPreview(null);
    setMapZoom(userLocation ? USER_LOCATION_ZOOM : DEFAULT_MAP_ZOOM);
    setMapCenter(userLocation ?? DEFAULT_BANGKOK_CENTER);
  };

  const tripPreviewOriginStop =
    tripPreview?.plan.legs[0]?.boardingStop.stopName ?? tripPreview?.originLabel ?? "";
  const tripPreviewLastLeg = tripPreview?.plan.legs[tripPreview.plan.legs.length - 1];
  const tripPreviewDestinationStop =
    tripPreviewLastLeg?.alightingStop.stopName ?? tripPreview?.destinationLabel ?? "";

  const nearbySheetHeight = tripPreview
    ? isNearbySheetExpanded
      ? "60%"
      : "40%"
    : isNearbySheetExpanded
      ? "60%"
      : "25%";

  const handleNearbySheetTouchEnd = (clientY: number) => {
    if (nearbySheetTouchStartY.current === null) {
      return;
    }

    const deltaY = clientY - nearbySheetTouchStartY.current;
    nearbySheetTouchStartY.current = null;

    if (deltaY < -28) {
      setIsNearbySheetExpanded(true);
    }

    if (deltaY > 28) {
      setIsNearbySheetExpanded(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-white overflow-hidden">
      <AppHeader />
      
      <div className="flex flex-1 pt-[60px] relative w-full h-full">
        <BottomNav />
        
        {/* Main Content Layout */}
        <div
          className="flex-1 relative w-full h-full md:flex md:flex-row md:pl-24"
          style={{
            "--nearby-sheet-height": nearbySheetHeight,
          } as React.CSSProperties}
        >
          
          {/* Map Section */}
          <div className="absolute inset-0 md:relative md:order-2 md:h-full md:flex-1 z-0">
            <MapView 
              center={mapCenter}
              zoom={mapZoom}
              routes={visibleRouteOverlays}
              markers={markers} 
              onMarkerClick={handleMarkerClick}
            />
            {/* Current Location Button Overlay */}
            <div className="absolute bottom-[calc(var(--nearby-sheet-height)+16px)] right-4 md:bottom-8 md:right-8 z-10">
              <Button
                variant="outline"
                size="icon"
                isLoading={isResolvingLocation}
                onClick={requestCurrentLocation}
                className="h-10 w-10 rounded-full border-gray-200 bg-white/90 shadow-xl backdrop-blur md:h-12 md:w-12"
              >
                <LocateFixed className="h-5 w-5 text-brand md:h-6 md:w-6" />
              </Button>
            </div>
          </div>

          {/* Nearby Stops List Section */}
          <div
            className="absolute inset-x-0 bottom-0 z-20 flex h-[var(--nearby-sheet-height)] flex-col rounded-t-3xl bg-white pb-[80px] shadow-[0_-10px_24px_-10px_rgba(15,23,42,0.25)] transition-[height] duration-300 ease-out md:relative md:inset-auto md:order-1 md:z-10 md:h-full md:w-[400px] md:rounded-t-none md:pb-0 md:shadow-[10px_0_20px_-10px_rgba(0,0,0,0.1)] lg:w-[450px]"
          >
            <div className="p-3 sm:p-4 md:p-6 bg-white border-b border-gray-100 flex-none rounded-t-3xl md:rounded-t-none">
              <button
                type="button"
                aria-label={
                  isNearbySheetExpanded
                    ? t("home.collapseNearbyStops")
                    : t("home.expandNearbyStops")
                }
                onClick={() => setIsNearbySheetExpanded((currentValue) => !currentValue)}
                onTouchStart={(event) => {
                  nearbySheetTouchStartY.current = event.touches[0]?.clientY ?? null;
                }}
                onTouchEnd={(event) => {
                  handleNearbySheetTouchEnd(event.changedTouches[0]?.clientY ?? 0);
                }}
                className="mx-auto mb-3 flex h-5 w-full items-center justify-center md:hidden"
              >
                <span className="h-1.5 w-16 rounded-full bg-gray-200" />
              </button>
              {tripPreview ? (
                <div className="flex items-start justify-between gap-3 px-2 lg:px-0">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">
                      {t("home.tripPreview")}
                    </p>
                    <h2 className="mt-1 text-xl font-black leading-tight text-gray-900 md:text-2xl">
                      <span>{tripPreviewOriginStop}</span>
                      <span className="mx-1 text-brand">→</span>
                      <span>{tripPreviewDestinationStop}</span>
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      {t("home.previewingTrip", {
                        routeNumber: tripPreview.plan.routeNumber,
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearTripPreview}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200"
                    aria-label={t("home.clearPreview")}
                    title={t("home.clearPreview")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
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
                </>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-3">
               {tripPreview ? (
                 <TripPreviewSummary plan={tripPreview.plan} />
               ) : isResolvingLocation || isLoadingStops ? (
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

function TripPreviewSummary({ plan }: { plan: TripPlanOption }) {
  const { t } = useLanguage();
  const isTransfer = plan.journeyType === "transfer";
  const firstLeg = plan.legs[0];
  const lastLeg = plan.legs[plan.legs.length - 1];

  return (
    <div className="space-y-3">
      <div className="rounded-3xl border border-orange-100 bg-orange-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${
                isTransfer ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {isTransfer ? t("home.transferTrip") : t("home.directTrip")}
            </span>
            <p className="mt-3 text-lg font-black leading-tight text-gray-950">
              {plan.routeName}
            </p>
            {plan.transferStop ? (
              <p className="mt-1 text-sm font-semibold text-blue-700">
                {t("home.transferAt", { name: plan.transferStop.stopName })}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
            <p className="text-xl font-black text-brand">
              {t("home.totalMinutes", { minutes: plan.totalMinutes })}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {firstLeg ? (
          <div className="rounded-2xl bg-gray-50 p-4">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-950">
                  {t("home.boardAt", { name: firstLeg.boardingStop.stopName })}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {t("home.walkWaitRide", {
                    walk: plan.walkToStopMinutes + plan.walkFromStopMinutes,
                    wait: plan.waitMinutes + plan.transferWaitMinutes,
                    ride: plan.rideMinutes,
                  })}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {lastLeg ? (
          <div className="rounded-2xl bg-gray-50 p-4">
            <div className="flex items-start gap-3">
              <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-950">
                  {t("home.getOffAt", { name: lastLeg.alightingStop.stopName })}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {plan.nextBus?.licensePlate ?? plan.nextBus?.busId ?? t("common.notAvailable")}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        {plan.legs.map((leg, index) => (
          <div
            key={`${leg.routeId}-${leg.direction}-${leg.boardingStop.stopId}-${leg.alightingStop.stopId}`}
            className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-950 text-sm font-black text-white">
                {leg.routeNumber}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-gray-950">
                  {t("home.legRoute", { number: index + 1, routeNumber: leg.routeNumber })}
                </p>
                <p className="mt-1 truncate text-xs text-gray-500">
                  {leg.boardingStop.stopName} → {leg.alightingStop.stopName}
                </p>
              </div>
              <div className="shrink-0 rounded-full bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                <BusFront className="mr-1 inline h-3.5 w-3.5 text-brand" />
                {t("home.waitRide", { wait: leg.waitMinutes, ride: leg.rideMinutes })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
