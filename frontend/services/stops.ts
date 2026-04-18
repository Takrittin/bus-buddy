import { fetchApi } from "@/lib/api-client";
import { Eta, Stop } from "@/types/bus";
import { ApiEtaResponse, ApiStopResponse, mapEtaResponse, mapStopResponse } from "@/services/transit-adapters";

export async function getStops(): Promise<Stop[]> {
  const stops = await fetchApi<ApiStopResponse[]>("/stops");
  return stops.map(mapStopResponse);
}

export async function getNearbyStops(lat: number, lng: number, radius = 1200): Promise<Stop[]> {
  const query = new URLSearchParams({
    lat: lat.toString(),
    lng: lng.toString(),
    radius: radius.toString(),
  });
  const stops = await fetchApi<ApiStopResponse[]>(`/nearby-stops?${query.toString()}`);
  return stops.map(mapStopResponse);
}

export async function getStopDetails(id: string): Promise<Stop> {
  const stop = await fetchApi<ApiStopResponse>(`/stops/${id}`);
  return mapStopResponse(stop);
}

export async function getEta(stopId: string): Promise<Eta[]> {
  const query = new URLSearchParams({ stopId });
  const eta = await fetchApi<ApiEtaResponse[]>(`/eta?${query.toString()}`);
  return eta.map(mapEtaResponse);
}
