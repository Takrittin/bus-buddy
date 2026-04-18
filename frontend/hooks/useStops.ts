"use client";

import { useEffect, useState } from "react";
import { Location, Stop } from "@/types/bus";
import { getNearbyStops } from "@/services/stops";

export function useStops(location: Location | null, radius = 1200) {
  const [stops, setStops] = useState<Stop[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(location));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!location) {
      setStops([]);
      setIsLoading(false);
      return;
    }

    const activeLocation = location;
    let isMounted = true;

    async function loadStops() {
      try {
        setIsLoading(true);
        const nearbyStops = await getNearbyStops(
          activeLocation.lat,
          activeLocation.lng,
          radius,
        );

        if (!isMounted) {
          return;
        }

        setStops(nearbyStops);
        setError(null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Unable to load nearby stops.");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadStops();

    return () => {
      isMounted = false;
    };
  }, [location?.lat, location?.lng, radius]);

  return {
    stops,
    isLoading,
    error,
    setStops,
  };
}
