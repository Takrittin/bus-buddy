import { fetchApi } from "@/lib/api-client";
import { Stop } from "@/types/bus";
import { ApiStopResponse, mapStopResponse } from "@/services/transit-adapters";

export async function getFavoriteStops(userId: string): Promise<Stop[]> {
  const stops = await fetchApi<ApiStopResponse[]>(`/users/${userId}/favorite-stops`);
  return stops.map(mapStopResponse);
}

export async function addFavoriteStop(userId: string, stop: Stop): Promise<void> {
  await fetchApi(`/users/${userId}/favorite-stops/${stop.id}`, {
    method: "POST",
  });
}

export async function removeFavoriteStop(userId: string, stopId: string): Promise<void> {
  await fetchApi(`/users/${userId}/favorite-stops/${stopId}`, {
    method: "DELETE",
  });
}

export async function isFavoriteStop(userId: string, stopId: string) {
  const favoriteStops = await getFavoriteStops(userId);
  return favoriteStops.some((favoriteStop) => favoriteStop.id === stopId);
}
