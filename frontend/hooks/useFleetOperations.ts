"use client";

import { startTransition, useEffect, useState } from "react";
import {
  closeFleetShift,
  createFleetShift,
  getFleetBuses,
  getFleetDrivers,
  getFleetShifts,
  updateFleetShift,
} from "@/services/fleet";
import {
  CloseDriverShiftInput,
  DriverShift,
  DriverShiftInput,
  FleetBusRecord,
  FleetDriver,
} from "@/types/fleet";

export function useFleetOperations(enabled = true) {
  const [drivers, setDrivers] = useState<FleetDriver[]>([]);
  const [fleetBuses, setFleetBuses] = useState<FleetBusRecord[]>([]);
  const [shifts, setShifts] = useState<DriverShift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    async function loadFleetOperations() {
      try {
        setIsLoading(true);
        const [nextDrivers, nextBuses, nextShifts] = await Promise.all([
          getFleetDrivers(),
          getFleetBuses(),
          getFleetShifts(),
        ]);

        if (!isMounted) {
          return;
        }

        startTransition(() => {
          setDrivers(nextDrivers);
          setFleetBuses(nextBuses);
          setShifts(nextShifts);
        });
        setError(null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Unable to load fleet data.");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadFleetOperations();

    return () => {
      isMounted = false;
    };
  }, [enabled]);

  async function refresh() {
    if (!enabled) {
      return;
    }

    const [nextDrivers, nextBuses, nextShifts] = await Promise.all([
      getFleetDrivers(),
      getFleetBuses(),
      getFleetShifts(),
    ]);

    startTransition(() => {
      setDrivers(nextDrivers);
      setFleetBuses(nextBuses);
      setShifts(nextShifts);
    });
    setError(null);
  }

  async function createShift(input: DriverShiftInput) {
    const shift = await createFleetShift(input);
    await refresh();
    return shift;
  }

  async function updateShift(shiftId: string, input: Partial<DriverShiftInput>) {
    const shift = await updateFleetShift(shiftId, input);
    await refresh();
    return shift;
  }

  async function closeShift(shiftId: string, input?: CloseDriverShiftInput) {
    const shift = await closeFleetShift(shiftId, input);
    await refresh();
    return shift;
  }

  return {
    drivers,
    fleetBuses,
    shifts,
    isLoading,
    error,
    refresh,
    createShift,
    updateShift,
    closeShift,
  };
}
