import { fetchApi } from "@/lib/api-client";
import { Bus } from "@/types/bus";
import {
  ApiBusLocationSocketEvent,
  ApiBusResponse,
  mapBusResponse,
  mergeRealtimeBusEvent,
} from "@/services/transit-adapters";

export async function getLiveBuses(routeId?: string): Promise<Bus[]> {
  const endpoint = routeId
    ? `/buses/live?routeId=${encodeURIComponent(routeId)}`
    : "/buses/live";

  const buses = await fetchApi<ApiBusResponse[]>(endpoint);
  return buses.map(mapBusResponse);
}

export async function getRouteVehicles(routeId: string): Promise<Bus[]> {
  const buses = await fetchApi<ApiBusResponse[]>(`/route-vehicles/${routeId}`);
  return buses.map(mapBusResponse);
}

export function applyLiveBusUpdate(currentBuses: Bus[], payload: ApiBusLocationSocketEvent) {
  const nextBuses = currentBuses.slice();
  const existingIndex = nextBuses.findIndex((bus) => bus.id === payload.bus_id);
  const existingBus = existingIndex >= 0 ? nextBuses[existingIndex] : undefined;
  const nextBus = mergeRealtimeBusEvent(existingBus, payload);

  if (existingIndex >= 0) {
    nextBuses[existingIndex] = nextBus;
  } else {
    nextBuses.push(nextBus);
  }

  return nextBuses.sort((left, right) => {
    if (left.routeNumber === right.routeNumber) {
      return left.id.localeCompare(right.id);
    }

    return (left.routeNumber ?? left.routeId).localeCompare(right.routeNumber ?? right.routeId);
  });
}
