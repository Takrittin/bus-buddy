export type DirectionId = 'outbound' | 'inbound';
export type ServiceLevel = 'local' | 'trunk' | 'express';

export type OccupancyLevel = 'low' | 'medium' | 'high' | 'full';

export type BusStatus =
  | 'running'
  | 'delayed'
  | 'near_stop'
  | 'at_stop'
  | 'out_of_service';

export type TrafficLevel = 'light' | 'moderate' | 'heavy' | 'severe';

export type TrafficPeriod =
  | 'early_morning'
  | 'morning_peak'
  | 'midday'
  | 'evening_peak'
  | 'late_evening'
  | 'night';

export type StopZone =
  | 'suburban'
  | 'arterial'
  | 'cbd'
  | 'interchange'
  | 'river_crossing';

export interface Location {
  lat: number;
  lng: number;
}

export interface StopSeed {
  stopId: string;
  stopName: string;
  location: Location;
  landmark: string;
  areaDescription: string;
  isMajorStop: boolean;
  isInterchange: boolean;
  zone: StopZone;
}

export interface RouteDirectionSeed {
  directionId: DirectionId;
  origin: string;
  destination: string;
  directionLabel: string;
  stopIds: string[];
  polyline: Location[];
}

export interface RouteSeed {
  routeId: string;
  routeNumber: string;
  routeName: string;
  color: string;
  origin: string;
  destination: string;
  outboundDirection: string;
  inboundDirection: string;
  firstBusTime: string;
  lastBusTime: string;
  averageHeadwayMinutes: number;
  baseCruiseSpeedKmh: number;
  maxSpeedKmh: number;
  serviceLevel: ServiceLevel;
  targetVehiclesPerDirection?: number;
  morningPeakFlow: DirectionId | 'balanced';
  eveningPeakFlow: DirectionId | 'balanced';
  directions: Record<DirectionId, RouteDirectionSeed>;
}

export interface StopAssignment {
  routeId: string;
  routeNumber: string;
  routeName: string;
  direction: DirectionId;
  sequence: number;
}

export interface StopState extends StopSeed {
  routeIds: string[];
  assignments: StopAssignment[];
}

export interface RouteStopState extends StopSeed {
  sequence: number;
  distanceFromStartMeters: number;
}

export interface RouteDirectionState extends RouteDirectionSeed {
  stops: RouteStopState[];
  cumulativeDistances: number[];
  totalDistanceMeters: number;
}

export interface RouteState extends RouteSeed {
  directions: Record<DirectionId, RouteDirectionState>;
}

export interface DelayEvent {
  eventId: string;
  routeId: string;
  direction: DirectionId;
  reason: string;
  multiplier: number;
  startedAt: string;
  endsAt: string;
}

export interface BusState {
  busId: string;
  vehicleNumber: string;
  licensePlate: string;
  driverName: string;
  capacity: number;
  routeId: string;
  routeNumber: string;
  direction: DirectionId;
  distanceAlongRouteMeters: number;
  currentPosition: Location;
  currentSegmentIndex: number;
  nextStopId: string;
  occupancyLevel: OccupancyLevel;
  occupancyLoad: number;
  speedKmh: number;
  baseSpeedKmh: number;
  maxSpeedKmh: number;
  status: BusStatus;
  trafficMultiplier: number;
  updatedAt: string;
  dwellUntilMs: number | null;
  layoverUntilMs: number | null;
  activeDelayEventId: string | null;
}

export interface EtaPrediction {
  stopId: string;
  busId: string;
  vehicleNumber: string;
  licensePlate: string;
  routeId: string;
  routeNumber: string;
  direction: DirectionId;
  estimatedArrivalTime: string;
  minutes: number;
  distanceMeters: number;
  trafficLevel: TrafficLevel;
  occupancyLevel: OccupancyLevel;
}

export interface RouteStatusSnapshot {
  routeId: string;
  routeNumber: string;
  direction: DirectionId;
  trafficLevel: TrafficLevel;
  averageSpeedKmh: number;
  averageDelayMinutes: number;
  activeDelayReasons: string[];
  updatedAt: string;
}
