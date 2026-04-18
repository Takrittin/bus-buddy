"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Stop } from "@/types/bus";
import { BusFront, Clock, Bell, Heart, Navigation, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/LoadingSkeleton";
import { useETA } from "@/hooks/useETA";
import { useAuth } from "@/hooks/auth/useAuth";
import {
  addFavoriteStop,
  isFavoriteStop,
  removeFavoriteStop,
} from "@/services/favorites";
import {
  addSubscription,
  findSubscription,
  removeSubscription,
} from "@/services/notifications";

interface StopDetailSheetProps {
  stop: Stop;
  onClose: () => void;
}

export function StopDetailSheet({ stop, onClose }: StopDetailSheetProps) {
  const { etas, isLoading, error } = useETA(stop.id);
  const router = useRouter();
  const { user, isAuthenticated, canUseRiderTools, isFleetManager } = useAuth();
  const [isFavorite, setIsFavorite] = useState(false);
  const [activeSubscriptionId, setActiveSubscriptionId] = useState<string | null>(null);
  const [isSavingFavorite, setIsSavingFavorite] = useState(false);
  const [isSavingAlert, setIsSavingAlert] = useState(false);
  const primaryEta = etas[0] ?? null;

  useEffect(() => {
    let isMounted = true;

    async function loadSavedState() {
      if (!isAuthenticated || !user?.id || !canUseRiderTools) {
        setIsFavorite(false);
        setActiveSubscriptionId(null);
        return;
      }

      try {
        const [favoriteState, subscription] = await Promise.all([
          isFavoriteStop(user.id, stop.id),
          primaryEta
            ? findSubscription(user.id, stop.id, primaryEta.routeId)
            : Promise.resolve(null),
        ]);

        if (!isMounted) {
          return;
        }

        setIsFavorite(favoriteState);
        setActiveSubscriptionId(subscription?.id ?? null);
      } catch {
        if (!isMounted) {
          return;
        }

        setIsFavorite(false);
        setActiveSubscriptionId(null);
      }
    }

    void loadSavedState();

    return () => {
      isMounted = false;
    };
  }, [canUseRiderTools, isAuthenticated, primaryEta?.routeId, stop.id, user?.id]);

  const requireLogin = () => {
    router.push("/settings?mode=login");
  };

  const handleOpenDirections = () => {
    if (typeof window === "undefined") {
      return;
    }

    const destination = `${stop.location.lat},${stop.location.lng}`;
    const mapsUrl = new URL("https://www.google.com/maps/dir/");
    mapsUrl.searchParams.set("api", "1");
    mapsUrl.searchParams.set("destination", destination);

    window.open(mapsUrl.toString(), "_blank", "noopener,noreferrer");
  };

  const handleFavoriteToggle = async () => {
    if (!isAuthenticated || !user?.id) {
      requireLogin();
      return;
    }

    if (!canUseRiderTools) {
      router.push("/fleet");
      return;
    }

    setIsSavingFavorite(true);

    try {
      if (isFavorite) {
        await removeFavoriteStop(user.id, stop.id);
        setIsFavorite(false);
        return;
      }

      await addFavoriteStop(user.id, stop);
      setIsFavorite(true);
    } catch {
      // Keep the current UI state if the database call fails.
    } finally {
      setIsSavingFavorite(false);
    }
  };

  const handleAlertToggle = async () => {
    if (!isAuthenticated || !user?.id) {
      requireLogin();
      return;
    }

    if (!canUseRiderTools) {
      router.push("/fleet");
      return;
    }

    if (!primaryEta) {
      return;
    }

    setIsSavingAlert(true);

    try {
      if (activeSubscriptionId) {
        await removeSubscription(user.id, activeSubscriptionId);
        setActiveSubscriptionId(null);
        return;
      }

      const subscription = await addSubscription({
        userId: user.id,
        stopId: stop.id,
        stopName: stop.name,
        routeId: primaryEta.routeId,
        routeNumber: primaryEta.routeNumber ?? primaryEta.routeId,
        leadTimeMinutes: 5,
        isActive: true,
      });

      setActiveSubscriptionId(subscription.id);
    } finally {
      setIsSavingAlert(false);
    }
  };

  return (
    <div className="fixed md:absolute inset-x-0 bottom-0 md:inset-auto md:top-4 md:right-4 md:w-[400px] z-50 p-4 md:p-0 transition-transform">
      {/* Invisible backdrop for mobile only to dismiss clicking outside */}
      <div 
        className="fixed inset-0 z-40 bg-black/20 md:hidden" 
        onClick={onClose} 
      />
      
      {/* The visible sheet/card */}
      <div className="relative z-50 bg-white rounded-3xl md:rounded-2xl shadow-2xl md:shadow-xl w-full max-h-[80vh] md:max-h-[calc(100vh-100px)] flex flex-col pt-3 pb-8 px-6 transform transition-transform border border-gray-100 md:h-[600px]">
        
        {/* Mobile Pull Indicator */}
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-4 md:hidden" />
        
        <div className="flex justify-between items-start mb-6 md:mt-4">
          <div className="min-w-0">
            <div className="flex items-start gap-3">
              <h2 className="text-2xl font-bold text-gray-900 leading-tight">{stop.name}</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleOpenDirections}
                className="h-10 w-10 flex-shrink-0 rounded-full bg-orange-50 text-brand hover:bg-orange-100"
                aria-label={`Open directions to ${stop.name} in Google Maps`}
                title={`Directions to ${stop.name}`}
              >
                <Navigation className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-brand font-medium mt-1">
              {stop.landmark ?? "Live Arrivals"}
            </p>
            {stop.areaDescription && (
              <p className="text-xs text-gray-500 mt-2 max-w-[260px] leading-5">
                {stop.areaDescription}
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="bg-gray-100 hover:bg-gray-200 rounded-full h-8 w-8 text-gray-500 flex-shrink-0 ml-4">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[200px] pr-2 -mr-2">
          {isLoading ? (
            <div className="space-y-4">
               <Skeleton className="h-16 w-full rounded-2xl" />
              <Skeleton className="h-16 w-full rounded-2xl" />
               <Skeleton className="h-16 w-full rounded-2xl" />
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center text-center text-gray-500 py-8">
              {error}
            </div>
          ) : etas.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-gray-500 py-8">
               No buses arriving soon.
            </div>
          ) : (
            <div className="space-y-3">
              {etas.map((eta, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-gray-50 border border-gray-100 rounded-2xl">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 bg-brand text-white text-lg font-bold rounded-xl items-center justify-center shadow-sm">
                      {eta.routeNumber ?? eta.routeId}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 border-b border-transparent pb-[2px]">Arriving in</p>
                      <div className="flex items-center text-xs text-gray-500 mt-1">
                         <Clock className="w-3.5 h-3.5 mr-1.5" />
                         {new Date(eta.estimatedArrivalDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Plate {eta.licensePlate ?? eta.vehicleNumber ?? eta.busId}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {(eta.direction ?? "outbound").replace("_", " ")} • {eta.trafficLevel ?? "moderate"} traffic
                      </p>
                    </div>
                  </div>
                  <div className="text-right pl-4">
                    <span className="text-3xl font-black text-brand tracking-tighter">{eta.minutes}</span>
                    <span className="text-sm font-bold text-brand ml-1 drop-shadow-sm">min</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="mt-6 space-y-3 border-t border-gray-50 pt-4">
          {!isAuthenticated ? (
            <p className="text-xs text-gray-500">
              Sign in from Settings to save favorite stops and enable alerts.
            </p>
          ) : isFleetManager ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Fleet Manager accounts focus on live operations, so rider favorites and arrival alerts are hidden for this role.
              </p>
              <Button
                className="h-14 w-full text-sm font-semibold shadow-lg shadow-brand/20 bg-brand hover:bg-brand-dark"
                variant="primary"
                onClick={() => router.push("/fleet")}
              >
                <BusFront className="mr-2 h-4 w-4" />
                Open Fleet Manager
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Button
                className="h-14 text-sm font-semibold"
                variant={isFavorite ? "secondary" : "outline"}
                isLoading={isSavingFavorite}
                onClick={() => void handleFavoriteToggle()}
              >
                <Heart className="mr-2 h-4 w-4" />
                {isFavorite ? "Saved" : "Save Stop"}
              </Button>

              <Button
                className="h-14 text-sm font-semibold shadow-lg shadow-brand/20 bg-brand hover:bg-brand-dark"
                variant="primary"
                isLoading={isSavingAlert}
                disabled={!primaryEta && isAuthenticated}
                onClick={() => void handleAlertToggle()}
              >
                <Bell className="mr-2 h-4 w-4" />
                {activeSubscriptionId ? "Alert On" : "Notify"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
