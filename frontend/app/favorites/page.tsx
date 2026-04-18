"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/navigation/AppHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { getFavoriteStops, removeFavoriteStop } from "@/services/favorites";
import { Stop } from "@/types/bus";
import { StopCard } from "@/components/stops/StopCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { StopCardSkeleton } from "@/components/ui/LoadingSkeleton";
import { BusFront, HeartOff, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/auth/useAuth";

export default function FavoritesPage() {
  const [favoriteStops, setFavoriteStops] = useState<Stop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const {
    user,
    isAuthenticated,
    isLoading: isAuthLoading,
    canUseRiderTools,
    isFleetManager,
  } = useAuth();

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    void fetchFavorites();
  }, [canUseRiderTools, isAuthLoading, isAuthenticated, user?.id]);

  const fetchFavorites = async () => {
    if (!isAuthenticated || !user?.id) {
      setFavoriteStops([]);
      setIsLoading(false);
      return;
    }

    if (!canUseRiderTools) {
      setFavoriteStops([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const stops = await getFavoriteStops(user.id);
      setFavoriteStops(stops);
    } catch {
      setFavoriteStops([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleFavorite = async (stopId: string, isFavorite: boolean) => {
    if (!isFavorite && user?.id) {
      try {
        await removeFavoriteStop(user.id, stopId);
        await fetchFavorites();
      } catch {
        // Keep the current list if the API call fails.
      }
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-gray-50 overflow-hidden">
      <AppHeader />
      
      <div className="flex flex-1 pt-[60px]">
        {/* Responsive margin for side rail */}
        <BottomNav />
        
        <main className="flex-1 w-full h-full overflow-y-auto pb-24 md:pb-8 md:pl-20">
          <div className="max-w-4xl mx-auto px-4 pt-6 md:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Saved Favorites</h2>
            
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <StopCardSkeleton />
                <StopCardSkeleton />
                <StopCardSkeleton />
              </div>
            ) : !isAuthenticated ? (
              <div className="mt-20">
                <EmptyState
                  icon={<LockKeyhole className="h-16 w-16 mx-auto" />}
                  title="Sign in to save favorites"
                  description="You can browse the app as a guest, but saved stops are only available after logging in."
                  action={
                    <Button
                      variant="primary"
                      onClick={() => router.push("/settings?mode=register")}
                    >
                      Open Settings
                    </Button>
                  }
                />
              </div>
            ) : isFleetManager ? (
              <div className="mt-20">
                <EmptyState
                  icon={<BusFront className="h-16 w-16 mx-auto" />}
                  title="Favorites are hidden for fleet managers"
                  description="This account is focused on operations, so saved rider stops are disabled for the fleet workflow."
                  action={
                    <Button
                      variant="primary"
                      onClick={() => router.push("/fleet")}
                    >
                      Open Fleet Manager
                    </Button>
                  }
                />
              </div>
            ) : favoriteStops.length === 0 ? (
              <div className="mt-20">
                <EmptyState 
                  icon={<HeartOff className="h-16 w-16 mx-auto" />}
                  title="No favorites yet"
                  description="Save stops you use frequently to quickly see bus ETAs."
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 antialiased">
                {favoriteStops.map(stop => (
                  <StopCard
                    key={stop.id}
                    stop={stop}
                    onClick={() => {}} 
                    isFavorite={true}
                    onToggleFavorite={async (isFav) => await handleToggleFavorite(stop.id, isFav)}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
