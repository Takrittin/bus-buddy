"use client";

import { startTransition, useEffect, useState } from "react";
import { Route } from "@/types/bus";
import { getRoutes, applyRouteStatusUpdate } from "@/services/routes";
import { subscribeToRouteStatusUpdates } from "@/services/socket";

export function useRoutes() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadRoutes() {
      try {
        setIsLoading(true);
        const routeData = await getRoutes();

        if (!isMounted) {
          return;
        }

        setRoutes(routeData);
        setError(null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Unable to load routes.");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadRoutes();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return subscribeToRouteStatusUpdates((payload) => {
      startTransition(() => {
        setRoutes((currentRoutes) => applyRouteStatusUpdate(currentRoutes, payload));
      });
    });
  }, []);

  return {
    routes,
    isLoading,
    error,
  };
}
