import { Direction, Location, OccupancyLevel, TrafficLevel } from "@/types/bus";

export interface CompactInsightStop {
  stopId: string;
  stopName: string;
  distanceMeters?: number;
  location: Location;
  routeIds: string[];
  landmark?: string;
}

export interface TripPlanOption {
  planId: string;
  journeyType: "direct" | "transfer";
  routeId: string;
  routeNumber: string;
  routeName: string;
  direction: Direction;
  boardingStop: CompactInsightStop;
  alightingStop: CompactInsightStop;
  transferStop?: CompactInsightStop;
  walkToStopMinutes: number;
  waitMinutes: number;
  rideMinutes: number;
  transferWaitMinutes: number;
  walkFromStopMinutes: number;
  totalMinutes: number;
  legs: TripPlanLeg[];
  nextBus?: {
    busId: string;
    licensePlate?: string;
    minutes: number;
    occupancyLevel?: OccupancyLevel;
    trafficLevel?: TrafficLevel;
  } | null;
}

export interface TripPlanLeg {
  routeId: string;
  routeNumber: string;
  routeName: string;
  direction: Direction;
  boardingStop: CompactInsightStop;
  alightingStop: CompactInsightStop;
  waitMinutes: number;
  rideMinutes: number;
  nextBus?: {
    busId: string;
    licensePlate?: string;
    minutes: number;
    occupancyLevel?: OccupancyLevel;
    trafficLevel?: TrafficLevel;
  } | null;
}

export interface TripPlannerResult {
  generatedAt: string;
  plans: TripPlanOption[];
  fallbackStops: {
    origin: CompactInsightStop[];
    destination: CompactInsightStop[];
  };
}

export interface StopCrowdingRecord {
  stopId: string;
  stopName: string;
  distanceMeters?: number;
  routeIds: string[];
  crowdingLevel: "comfortable" | "moderate" | "crowded" | "very_crowded";
  crowdingScore: number;
  fullOrHighBuses: number;
  reason: string;
  nextArrivals: Array<{
    routeNumber?: string;
    minutes: number;
    occupancyLevel?: OccupancyLevel;
  }>;
}

export interface ServiceAlertRecord {
  id: string;
  type: "route_delay" | "headway_gap" | "crowding";
  severity: "critical" | "warning" | "info";
  routeId: string;
  routeNumber: string;
  direction: Direction;
  title: string;
  description: string;
  affectedBuses: number;
  updatedAt: string;
}

export interface FleetDispatchRecord {
  routeId: string;
  routeNumber: string;
  routeName: string;
  direction: Direction;
  priorityScore: number;
  averageDelayMinutes: number;
  trafficLevel: TrafficLevel;
  liveBuses: number;
  headwayRiskMinutes: number;
  suggestedAction: string;
  suggestedBus?: {
    busId: string;
    vehicleNumber: string;
    licensePlate?: string;
    currentRouteNumber?: string;
    occupancyLevel?: OccupancyLevel;
  } | null;
}

export interface AnalyticsDashboard {
  generatedAt: string;
  summary: {
    activeBuses: number;
    onTimeRate: number;
    averageSpeedKmh: number;
    severeTrafficRoutes: number;
    fullBuses: number;
  };
  busiestStops: StopCrowdingRecord[];
  routeReliability: Array<{
    routeId: string;
    routeNumber: string;
    routeName: string;
    reliabilityScore: number;
    averageDelayMinutes: number;
    averageSpeedKmh: number;
  }>;
}
