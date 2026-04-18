"use client";

import { startTransition, useEffect, useState } from "react";
import { Eta } from "@/types/bus";
import { getEta } from "@/services/stops";
 
const ETA_REFRESH_INTERVAL_MS = 5000;

function sortEta(left: Eta, right: Eta) {
  if (left.minutes === right.minutes) {
    return (left.routeNumber ?? left.routeId).localeCompare(right.routeNumber ?? right.routeId);
  }

  return left.minutes - right.minutes;
}

export function useETA(stopId: string | null) {
  const [etas, setEtas] = useState<Eta[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(stopId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stopId) {
      setEtas([]);
      setIsLoading(false);
      return;
    }

    const activeStopId = stopId;
    let isMounted = true;
    let isFetching = false;

    async function loadEta(showLoader = false) {
      if (isFetching) {
        return;
      }

      try {
        isFetching = true;

        if (showLoader) {
          setIsLoading(true);
        }

        const etaData = await getEta(activeStopId);

        if (!isMounted) {
          return;
        }

        startTransition(() => {
          setEtas(etaData.toSorted(sortEta));
        });
        setError(null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Unable to load arrivals.");
      } finally {
        isFetching = false;

        if (isMounted && showLoader) {
          setIsLoading(false);
        }
      }
    }

    void loadEta(true);

    const intervalId = window.setInterval(() => {
      void loadEta(false);
    }, ETA_REFRESH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadEta(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [stopId]);

  return {
    etas,
    isLoading,
    error,
  };
}
