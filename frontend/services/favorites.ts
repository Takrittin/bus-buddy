import { fetchApi } from "@/lib/api-client";
import { Stop } from "@/types/bus";
import { ApiStopResponse, mapStopResponse } from "@/services/transit-adapters";

const LEGACY_FAVORITES_STORAGE_VERSION = 1;
const LEGACY_FAVORITE_STOPS_KEY = `busbuddy.favoriteStops.v${LEGACY_FAVORITES_STORAGE_VERSION}`;

function legacyFavoriteStopsKey(userId: string) {
  return `${LEGACY_FAVORITE_STOPS_KEY}.${userId}`;
}

function readLegacyFavoriteStops(userId: string): Stop[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(legacyFavoriteStopsKey(userId));

    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

function clearLegacyFavoriteStops(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(legacyFavoriteStopsKey(userId));
}

async function syncLegacyFavoriteStops(userId: string) {
  const legacyStops = readLegacyFavoriteStops(userId);

  if (legacyStops.length === 0) {
    return;
  }

  await Promise.allSettled(
    legacyStops.map((stop) =>
      fetchApi(`/users/${userId}/favorite-stops/${stop.id}`, {
        method: "POST",
      }),
    ),
  );

  clearLegacyFavoriteStops(userId);
}

export async function getFavoriteStops(userId: string): Promise<Stop[]> {
  await syncLegacyFavoriteStops(userId);

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
