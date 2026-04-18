"use client";

import { startTransition, useEffect, useState } from "react";
import { Bus } from "@/types/bus";
import { applyLiveBusUpdate, getLiveBuses } from "@/services/buses";
import { subscribeToBusLocationUpdates } from "@/services/socket";

export function useLiveBuses(routeId?: string) {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadBuses() {
      try {
        setIsLoading(true);
        const liveBuses = await getLiveBuses(routeId);

        if (!isMounted) {
          return;
        }

        setBuses(liveBuses);
        setError(null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Unable to load live buses.");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadBuses();

    return () => {
      isMounted = false;
    };
  }, [routeId]);

  useEffect(() => {
    return subscribeToBusLocationUpdates((payload) => {
      if (routeId && payload.route_id !== routeId) {
        return;
      }

      startTransition(() => {
        setBuses((currentBuses) => applyLiveBusUpdate(currentBuses, payload));
      });
    });
  }, [routeId]);

  return {
    buses,
    isLoading,
    error,
  };
}
