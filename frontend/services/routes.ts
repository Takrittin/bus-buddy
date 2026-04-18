import { fetchApi } from "@/lib/api-client";
import { Route } from "@/types/bus";
import {
  ApiRouteResponse,
  ApiRouteStatusSocketEvent,
  mapRouteResponse,
  mergeRouteStatusPayload,
} from "@/services/transit-adapters";

export async function getRoutes(): Promise<Route[]> {
  const routes = await fetchApi<ApiRouteResponse[]>("/routes");
  return routes.map(mapRouteResponse);
}

export async function getRouteDetails(routeId: string): Promise<Route> {
  const route = await fetchApi<ApiRouteResponse>(`/routes/${routeId}`);
  return mapRouteResponse(route);
}

export function applyRouteStatusUpdate(currentRoutes: Route[], payload: ApiRouteStatusSocketEvent) {
  return currentRoutes.map((route) => mergeRouteStatusPayload(route, payload));
}
