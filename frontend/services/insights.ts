import { fetchApi } from "@/lib/api-client";
import {
  AnalyticsDashboard,
  CompactInsightStop,
  FleetDispatchRecord,
  ServiceAlertRecord,
  StopCrowdingRecord,
  TripPlannerResult,
} from "@/types/insights";

interface ApiCompactStop {
  stop_id: string;
  stop_name: string;
  distance_meters?: number;
  latitude: number;
  longitude: number;
  route_ids: string[];
  landmark?: string;
}

interface ApiTripPlan {
  plan_id: string;
  route_id: string;
  route_number: string;
  route_name: string;
  direction: "outbound" | "inbound";
  boarding_stop: ApiCompactStop;
  alighting_stop: ApiCompactStop;
  walk_to_stop_minutes: number;
  wait_minutes: number;
  ride_minutes: number;
  walk_from_stop_minutes: number;
  total_minutes: number;
  next_bus?: {
    bus_id: string;
    license_plate?: string;
    minutes: number;
    occupancy_level?: "low" | "medium" | "high" | "full";
    traffic_level?: "light" | "moderate" | "heavy" | "severe";
  } | null;
}

interface ApiTripPlannerResponse {
  generated_at: string;
  plans: ApiTripPlan[];
  fallback_stops: {
    origin: ApiCompactStop[];
    destination: ApiCompactStop[];
  };
}

interface ApiStopCrowdingRecord {
  stop_id: string;
  stop_name: string;
  distance_meters?: number;
  route_ids: string[];
  crowding_level: "comfortable" | "moderate" | "crowded" | "very_crowded";
  crowding_score: number;
  full_or_high_buses: number;
  reason: string;
  next_arrivals: Array<{
    route_number?: string;
    minutes: number;
    occupancy_level?: "low" | "medium" | "high" | "full";
  }>;
}

interface ApiServiceAlertRecord {
  id: string;
  type: "route_delay" | "headway_gap" | "crowding";
  severity: "critical" | "warning" | "info";
  route_id: string;
  route_number: string;
  direction: "outbound" | "inbound";
  title: string;
  description: string;
  affected_buses: number;
  updated_at: string;
}

interface ApiFleetDispatchRecord {
  route_id: string;
  route_number: string;
  route_name: string;
  direction: "outbound" | "inbound";
  priority_score: number;
  average_delay_minutes: number;
  traffic_level: "light" | "moderate" | "heavy" | "severe";
  live_buses: number;
  headway_risk_minutes: number;
  suggested_action: string;
  suggested_bus?: {
    bus_id: string;
    vehicle_number: string;
    license_plate?: string;
    current_route_number?: string;
    occupancy_level?: "low" | "medium" | "high" | "full";
  } | null;
}

interface ApiAnalyticsDashboard {
  generated_at: string;
  summary: {
    active_buses: number;
    on_time_rate: number;
    average_speed_kmh: number;
    severe_traffic_routes: number;
    full_buses: number;
  };
  busiest_stops: ApiStopCrowdingRecord[];
  route_reliability: Array<{
    route_id: string;
    route_number: string;
    route_name: string;
    reliability_score: number;
    average_delay_minutes: number;
    average_speed_kmh: number;
  }>;
}

function mapStop(stop: ApiCompactStop): CompactInsightStop {
  return {
    stopId: stop.stop_id,
    stopName: stop.stop_name,
    distanceMeters: stop.distance_meters,
    location: {
      lat: stop.latitude,
      lng: stop.longitude,
    },
    routeIds: stop.route_ids,
    landmark: stop.landmark,
  };
}

function mapTripPlan(plan: ApiTripPlan) {
  return {
    planId: plan.plan_id,
    routeId: plan.route_id,
    routeNumber: plan.route_number,
    routeName: plan.route_name,
    direction: plan.direction,
    boardingStop: mapStop(plan.boarding_stop),
    alightingStop: mapStop(plan.alighting_stop),
    walkToStopMinutes: plan.walk_to_stop_minutes,
    waitMinutes: plan.wait_minutes,
    rideMinutes: plan.ride_minutes,
    walkFromStopMinutes: plan.walk_from_stop_minutes,
    totalMinutes: plan.total_minutes,
    nextBus: plan.next_bus
      ? {
          busId: plan.next_bus.bus_id,
          licensePlate: plan.next_bus.license_plate,
          minutes: plan.next_bus.minutes,
          occupancyLevel: plan.next_bus.occupancy_level,
          trafficLevel: plan.next_bus.traffic_level,
        }
      : null,
  };
}

function mapCrowding(record: ApiStopCrowdingRecord): StopCrowdingRecord {
  return {
    stopId: record.stop_id,
    stopName: record.stop_name,
    distanceMeters: record.distance_meters,
    routeIds: record.route_ids,
    crowdingLevel: record.crowding_level,
    crowdingScore: record.crowding_score,
    fullOrHighBuses: record.full_or_high_buses,
    reason: record.reason,
    nextArrivals: record.next_arrivals.map((arrival) => ({
      routeNumber: arrival.route_number,
      minutes: arrival.minutes,
      occupancyLevel: arrival.occupancy_level,
    })),
  };
}

function mapServiceAlert(alert: ApiServiceAlertRecord): ServiceAlertRecord {
  return {
    id: alert.id,
    type: alert.type,
    severity: alert.severity,
    routeId: alert.route_id,
    routeNumber: alert.route_number,
    direction: alert.direction,
    title: alert.title,
    description: alert.description,
    affectedBuses: alert.affected_buses,
    updatedAt: alert.updated_at,
  };
}

function mapFleetDispatch(record: ApiFleetDispatchRecord): FleetDispatchRecord {
  return {
    routeId: record.route_id,
    routeNumber: record.route_number,
    routeName: record.route_name,
    direction: record.direction,
    priorityScore: record.priority_score,
    averageDelayMinutes: record.average_delay_minutes,
    trafficLevel: record.traffic_level,
    liveBuses: record.live_buses,
    headwayRiskMinutes: record.headway_risk_minutes,
    suggestedAction: record.suggested_action,
    suggestedBus: record.suggested_bus
      ? {
          busId: record.suggested_bus.bus_id,
          vehicleNumber: record.suggested_bus.vehicle_number,
          licensePlate: record.suggested_bus.license_plate,
          currentRouteNumber: record.suggested_bus.current_route_number,
          occupancyLevel: record.suggested_bus.occupancy_level,
        }
      : null,
  };
}

function mapAnalytics(response: ApiAnalyticsDashboard): AnalyticsDashboard {
  return {
    generatedAt: response.generated_at,
    summary: {
      activeBuses: response.summary.active_buses,
      onTimeRate: response.summary.on_time_rate,
      averageSpeedKmh: response.summary.average_speed_kmh,
      severeTrafficRoutes: response.summary.severe_traffic_routes,
      fullBuses: response.summary.full_buses,
    },
    busiestStops: response.busiest_stops.map(mapCrowding),
    routeReliability: response.route_reliability.map((route) => ({
      routeId: route.route_id,
      routeNumber: route.route_number,
      routeName: route.route_name,
      reliabilityScore: route.reliability_score,
      averageDelayMinutes: route.average_delay_minutes,
      averageSpeedKmh: route.average_speed_kmh,
    })),
  };
}

export async function getTripPlan(input: {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
}): Promise<TripPlannerResult> {
  const query = new URLSearchParams({
    originLat: String(input.originLat),
    originLng: String(input.originLng),
    destinationLat: String(input.destinationLat),
    destinationLng: String(input.destinationLng),
  });
  const response = await fetchApi<ApiTripPlannerResponse>(`/insights/trip-planner?${query}`);

  return {
    generatedAt: response.generated_at,
    plans: response.plans.map(mapTripPlan),
    fallbackStops: {
      origin: response.fallback_stops.origin.map(mapStop),
      destination: response.fallback_stops.destination.map(mapStop),
    },
  };
}

export async function getStopCrowding(input?: {
  lat?: number;
  lng?: number;
  radius?: number;
}): Promise<StopCrowdingRecord[]> {
  const query = new URLSearchParams();

  if (typeof input?.lat === "number" && typeof input.lng === "number") {
    query.set("lat", String(input.lat));
    query.set("lng", String(input.lng));
  }

  if (typeof input?.radius === "number") {
    query.set("radius", String(input.radius));
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetchApi<ApiStopCrowdingRecord[]>(`/insights/stop-crowding${suffix}`);

  return response.map(mapCrowding);
}

export async function getServiceAlerts(): Promise<ServiceAlertRecord[]> {
  const response = await fetchApi<ApiServiceAlertRecord[]>("/insights/service-alerts");
  return response.map(mapServiceAlert);
}

export async function getFleetDispatchBoard(): Promise<FleetDispatchRecord[]> {
  const response = await fetchApi<ApiFleetDispatchRecord[]>("/insights/fleet-dispatch");
  return response.map(mapFleetDispatch);
}

export async function getAnalyticsDashboard(): Promise<AnalyticsDashboard> {
  const response = await fetchApi<ApiAnalyticsDashboard>("/insights/analytics");
  return mapAnalytics(response);
}
