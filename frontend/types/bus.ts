export interface Location {
  lat: number;
  lng: number;
}

export type Direction = "outbound" | "inbound";

export type OccupancyLevel = "low" | "medium" | "high" | "full";

export type BusStatus =
  | "running"
  | "delayed"
  | "near_stop"
  | "at_stop"
  | "out_of_service";

export type TrafficLevel = "light" | "moderate" | "heavy" | "severe";

export interface RouteAssignment {
  routeId: string;
  routeNumber: string;
  routeName: string;
  direction: Direction;
  sequence: number;
}

export interface RouteStop {
  id: string;
  name: string;
  location: Location;
  sequence: number;
  landmark?: string;
  areaDescription?: string;
  isMajorStop?: boolean;
  isInterchange?: boolean;
}

export interface RouteStatus {
  direction: Direction;
  trafficLevel: TrafficLevel;
  averageSpeedKmh: number;
  averageDelayMinutes: number;
  activeDelayReasons: string[];
  updatedAt: string;
}

export interface RouteDirection {
  id: Direction;
  label: string;
  origin: string;
  destination: string;
  polyline: Location[];
  stops: RouteStop[];
  totalDistanceMeters: number;
  stopCount: number;
  status?: RouteStatus;
}

export interface Stop {
  id: string;
  name: string;
  location: Location;
  distance?: number; // In meters, if calculated
  routeIds?: string[];
  landmark?: string;
  areaDescription?: string;
  isMajorStop?: boolean;
  isInterchange?: boolean;
  routeAssignments?: RouteAssignment[];
  etaPredictions?: Eta[];
}

export interface Route {
  id: string;
  name: string;
  description: string;
  color?: string; // Hex color for the route line
  routeNumber: string;
  routeName: string;
  origin: string;
  destination: string;
  outboundDirection: string;
  inboundDirection: string;
  firstBusTime: string;
  lastBusTime: string;
  averageHeadwayMinutes: number;
  directions: Record<Direction, RouteDirection>;
  currentStatus?: Partial<Record<Direction, RouteStatus>>;
}

export interface BusSegment {
  index: number;
  from: Location;
  to: Location;
}

export interface Bus {
  id: string;
  routeId: string;
  routeNumber?: string;
  location: Location;
  lastUpdated: string; // ISO date string
  speed?: number; // km/h
  direction?: Direction;
  vehicleNumber?: string;
  licensePlate?: string;
  driverName?: string;
  capacity?: number;
  nextStopId?: string;
  nextStopName?: string;
  occupancyLevel?: OccupancyLevel;
  status?: BusStatus;
  trafficLevel?: TrafficLevel;
  trafficMultiplier?: number;
  etaToNextStopMinutes?: number;
  currentSegment?: BusSegment;
}

export interface Eta {
  busId: string;
  vehicleNumber?: string;
  licensePlate?: string;
  routeId: string;
  routeNumber?: string;
  stopId: string;
  stopName?: string;
  direction?: Direction;
  estimatedArrivalDate: string; // ISO date string
  minutes: number;
  distanceMeters?: number;
  trafficLevel?: TrafficLevel;
  occupancyLevel?: OccupancyLevel;
}

export interface RouteOverlay {
  id: string;
  label: string;
  color: string;
  direction: Direction;
  waypoints: Location[];
  trafficLevel?: TrafficLevel;
}
