"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/navigation/AppHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { Button } from "@/components/ui/Button";
import { getStops } from "@/services/stops";
import { getTripPlan } from "@/services/insights";
import { Location, Stop } from "@/types/bus";
import { TripPlanOption, TripPlannerResult } from "@/types/insights";
import { saveTripPreview } from "@/lib/trip-preview";
import { BusFront, LocateFixed, Map as MapIcon, MapPin, Navigation, Route } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const CURRENT_LOCATION_VALUE = "__current_location__";
const DEFAULT_BANGKOK_CENTER: Location = { lat: 13.7457, lng: 100.5347 };

export default function TripPlannerPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [stops, setStops] = useState<Stop[]>([]);
  const [originStopId, setOriginStopId] = useState(CURRENT_LOCATION_VALUE);
  const [destinationStopId, setDestinationStopId] = useState("");
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [tripPlan, setTripPlan] = useState<TripPlannerResult | null>(null);
  const [isLoadingStops, setIsLoadingStops] = useState(true);
  const [isResolvingLocation, setIsResolvingLocation] = useState(true);
  const [isPlanningTrip, setIsPlanningTrip] = useState(false);

  const sortedStops = useMemo(
    () => stops.toSorted((left, right) => left.name.localeCompare(right.name)),
    [stops],
  );

  const originStop = useMemo(
    () => sortedStops.find((stop) => stop.id === originStopId) ?? null,
    [originStopId, sortedStops],
  );

  const destinationStop = useMemo(
    () => sortedStops.find((stop) => stop.id === destinationStopId) ?? null,
    [destinationStopId, sortedStops],
  );

  const originLocation =
    originStopId === CURRENT_LOCATION_VALUE
      ? userLocation ?? DEFAULT_BANGKOK_CENTER
      : originStop?.location ?? null;
  const originLabel =
    originStopId === CURRENT_LOCATION_VALUE
      ? t("home.currentLocation")
      : originStop?.name ?? t("home.origin");

  const requestCurrentLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setUserLocation(DEFAULT_BANGKOK_CENTER);
      setIsResolvingLocation(false);
      return;
    }

    setIsResolvingLocation(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setIsResolvingLocation(false);
      },
      () => {
        setUserLocation(DEFAULT_BANGKOK_CENTER);
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
    let isMounted = true;

    async function loadStops() {
      try {
        const nextStops = await getStops();

        if (isMounted) {
          setStops(nextStops);
        }
      } catch {
        if (isMounted) {
          setStops([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingStops(false);
        }
      }
    }

    void loadStops();
    requestCurrentLocation();

    return () => {
      isMounted = false;
    };
  }, [requestCurrentLocation]);

  const handlePlanTrip = useCallback(async () => {
    if (!originLocation || !destinationStop) {
      return;
    }

    setIsPlanningTrip(true);

    try {
      const nextTripPlan = await getTripPlan({
        originLat: originLocation.lat,
        originLng: originLocation.lng,
        destinationLat: destinationStop.location.lat,
        destinationLng: destinationStop.location.lng,
      });
      setTripPlan(nextTripPlan);
    } finally {
      setIsPlanningTrip(false);
    }
  }, [destinationStop, originLocation]);

  const handlePreviewPlan = useCallback(
    (plan: TripPlanOption) => {
      if (!originLocation || !destinationStop) {
        return;
      }

      saveTripPreview({
        plan,
        originLabel,
        originLocation,
        destinationLabel: destinationStop.name,
        destinationLocation: destinationStop.location,
        createdAt: new Date().toISOString(),
      });
      router.push("/");
    },
    [destinationStop, originLabel, originLocation, router],
  );

  return (
    <div className="flex min-h-screen w-full flex-col bg-gray-50">
      <AppHeader />

      <div className="flex min-h-[calc(100vh-60px)] flex-1 pt-[60px]">
        <BottomNav />

        <main className="w-full flex-1 pb-24 md:pb-8 md:pl-24">
          <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 md:px-8 md:py-8">
            <section className="overflow-hidden rounded-[2rem] border border-orange-100 bg-white shadow-sm">
              <div className="bg-gradient-to-br from-orange-50 via-white to-amber-50 p-5 sm:p-6 md:p-8">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div className="max-w-2xl">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-brand shadow-sm">
                      <Route className="h-4 w-4" />
                      {t("home.tripPlanner")}
                    </div>
                    <h1 className="text-3xl font-black tracking-tight text-gray-950 sm:text-4xl">
                      {t("home.tripPlanner")}
                    </h1>
                    <p className="mt-3 text-sm leading-6 text-gray-600 sm:text-base">
                      {t("home.tripPlannerPageHint")}
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    isLoading={isResolvingLocation}
                    onClick={requestCurrentLocation}
                    className="h-12 rounded-2xl bg-white"
                  >
                    <LocateFixed className="mr-2 h-4 w-4 text-brand" />
                    {t("home.currentLocation")}
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-[1fr_1fr_auto] md:items-end md:p-8">
                <label className="grid gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
                    {t("home.origin")}
                  </span>
                  <select
                    value={originStopId}
                    onChange={(event) => {
                      setOriginStopId(event.target.value);
                      setTripPlan(null);
                    }}
                    className="h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-orange-100"
                  >
                    <option value={CURRENT_LOCATION_VALUE}>{t("home.currentLocation")}</option>
                    {sortedStops.map((stop) => (
                      <option key={stop.id} value={stop.id}>
                        {stop.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
                    {t("home.destinationStop")}
                  </span>
                  <select
                    value={destinationStopId}
                    disabled={isLoadingStops}
                    onChange={(event) => {
                      setDestinationStopId(event.target.value);
                      setTripPlan(null);
                    }}
                    className="h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-orange-100 disabled:text-gray-400"
                  >
                    <option value="">{t("home.chooseDestination")}</option>
                    {sortedStops.map((stop) => (
                      <option key={stop.id} value={stop.id}>
                        {stop.name}
                      </option>
                    ))}
                  </select>
                </label>

                <Button
                  type="button"
                  variant="primary"
                  disabled={!destinationStop || !originLocation}
                  isLoading={isPlanningTrip}
                  onClick={handlePlanTrip}
                  className="h-12 rounded-2xl px-6"
                >
                  {isPlanningTrip ? t("home.planningTrip") : t("home.planTrip")}
                </Button>
              </div>
            </section>

            <section className="mt-5 grid gap-4">
              {tripPlan ? (
                tripPlan.plans.length === 0 ? (
                  <div className="rounded-[2rem] border border-gray-100 bg-white p-8 text-center text-gray-500 shadow-sm">
                    {t("home.noTripPlanWithTransfer")}
                  </div>
                ) : (
                  tripPlan.plans.map((plan) => (
                    <TripPlanCard
                      key={plan.planId}
                      plan={plan}
                      onPreview={() => handlePreviewPlan(plan)}
                    />
                  ))
                )
              ) : (
                <div className="rounded-[2rem] border border-dashed border-orange-200 bg-white p-8 text-center text-gray-500">
                  {t("home.tripPlannerHint")}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

function TripPlanCard({
  plan,
  onPreview,
}: {
  plan: TripPlanOption;
  onPreview: () => void;
}) {
  const { t } = useLanguage();
  const isTransfer = plan.journeyType === "transfer";
  const legs = plan.legs.length > 0 ? plan.legs : [
    {
      routeId: plan.routeId,
      routeNumber: plan.routeNumber,
      routeName: plan.routeName,
      direction: plan.direction,
      boardingStop: plan.boardingStop,
      alightingStop: plan.alightingStop,
      waitMinutes: plan.waitMinutes,
      rideMinutes: plan.rideMinutes,
      nextBus: plan.nextBus,
    },
  ];

  return (
    <article className="rounded-[2rem] border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex min-h-14 min-w-14 items-center justify-center rounded-2xl bg-brand px-3 text-lg font-black text-white shadow-lg shadow-brand/20">
            {plan.routeNumber}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ${
                  isTransfer ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {isTransfer ? t("home.transferTrip") : t("home.directTrip")}
              </span>
              <span className="text-xs font-semibold text-gray-400">
                {plan.direction.replace("_", " ")}
              </span>
            </div>
            <p className="mt-2 text-lg font-black text-gray-950">{plan.routeName}</p>
            {plan.transferStop ? (
              <p className="mt-1 text-sm font-semibold text-blue-700">
                {t("home.transferAt", { name: plan.transferStop.stopName })}
              </p>
            ) : null}
          </div>
        </div>
        <div className="rounded-2xl bg-orange-50 px-4 py-3 text-left sm:text-right">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">
            {t("home.bestOptions")}
          </p>
          <p className="text-2xl font-black text-brand">
            {t("home.totalMinutes", { minutes: plan.totalMinutes })}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-gray-50 p-4">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 text-brand" />
            <div>
              <p className="text-sm font-bold text-gray-950">
                {t("home.boardAt", { name: plan.boardingStop.stopName })}
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
        <div className="rounded-2xl bg-gray-50 p-4">
          <div className="flex items-start gap-3">
            <Navigation className="mt-0.5 h-4 w-4 text-brand" />
            <div>
              <p className="text-sm font-bold text-gray-950">
                {t("home.getOffAt", { name: plan.alightingStop.stopName })}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {plan.nextBus?.licensePlate ?? plan.nextBus?.busId ?? t("common.notAvailable")}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {legs.map((leg, index) => (
          <div
            key={`${leg.routeId}-${leg.direction}-${leg.boardingStop.stopId}-${leg.alightingStop.stopId}`}
            className="rounded-2xl border border-gray-100 bg-white p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-sm font-black text-white">
                  {leg.routeNumber}
                </div>
                <div>
                  <p className="text-sm font-black text-gray-950">
                    {t("home.legRoute", { number: index + 1, routeNumber: leg.routeNumber })}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {t("home.boardAt", { name: leg.boardingStop.stopName })}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {t("home.getOffAt", { name: leg.alightingStop.stopName })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                <BusFront className="h-4 w-4 text-brand" />
                {t("home.waitRide", { wait: leg.waitMinutes, ride: leg.rideMinutes })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Button type="button" variant="outline" onClick={onPreview} className="rounded-2xl">
          <MapIcon className="mr-2 h-4 w-4 text-brand" />
          {t("home.previewOnMap")}
        </Button>
      </div>
    </article>
  );
}
