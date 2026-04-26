import { Location } from "@/types/bus";
import { TripPlanOption } from "@/types/insights";

export const TRIP_PREVIEW_STORAGE_KEY = "busbuddy.tripPreview.v1";

export interface TripPreview {
  plan: TripPlanOption;
  originLabel: string;
  originLocation: Location;
  destinationLabel: string;
  destinationLocation: Location;
  createdAt: string;
}

export function saveTripPreview(preview: TripPreview) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(TRIP_PREVIEW_STORAGE_KEY, JSON.stringify(preview));
}

export function readTripPreview() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(TRIP_PREVIEW_STORAGE_KEY);

    return rawValue ? (JSON.parse(rawValue) as TripPreview) : null;
  } catch {
    return null;
  }
}

export function clearTripPreview() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(TRIP_PREVIEW_STORAGE_KEY);
}
