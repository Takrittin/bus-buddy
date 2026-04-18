import {
  Bus,
  Direction,
  Eta,
  Location,
  Route,
  RouteAssignment,
  RouteDirection,
  RouteStatus,
  Stop,
  TrafficLevel,
} from "@/types/bus";

const ROUTE_COLOR_BY_NUMBER: Record<string, string> = {
  "8": "#1D4ED8",
  "26": "#F97316",
  "29": "#F26F22",
  "34": "#0EA5E9",
  "59": "#DC2626",
  "77": "#0F766E",
  "145": "#7C3AED",
  "510": "#0891B2",
  "511": "#B91C1C",
};

const ROUTE_COLOR_FALLBACKS = ["#F26F22", "#1D4ED8", "#0F766E", "#B91C1C", "#CA8A04"];

export interface ApiRouteStatusResponse {
  direction: Direction;
  traffic_level: TrafficLevel;
  average_speed_kmh: number;
  average_delay_minutes: number;
  active_delay_reasons: string[];
  updated_at: string;
}

export interface ApiEtaResponse {
  stop_id: string;
  stop_name: string;
  bus_id: string;
  vehicle_number?: string;
  license_plate?: string;
  route_id: string;
  route_number: string;
  direction: Direction;
  estimated_arrival_time: string;
  minutes: number;
  distance_meters: number;
  traffic_level: TrafficLevel;
  occupancy_level: Bus["occupancyLevel"];
}

export interface ApiRouteAssignmentResponse {
  route_id: string;
  route_number: string;
  route_name: string;
  direction: Direction;
  sequence: number;
}

export interface ApiStopResponse {
  stop_id: string;
  stop_name: string;
  latitude: number;
  longitude: number;
  route_ids: string[];
  landmark: string;
  area_description: string;
  is_major_stop: boolean;
  is_interchange: boolean;
  route_assignments?: ApiRouteAssignmentResponse[];
  eta_predictions?: ApiEtaResponse[];
  distance_meters?: number;
}

export interface ApiRouteStopResponse {
  stop_id: string;
  stop_name: string;
  latitude: number;
  longitude: number;
  sequence: number;
  landmark: string;
  area_description: string;
  is_major_stop: boolean;
  is_interchange: boolean;
}

export interface ApiRouteDirectionResponse {
  origin: string;
  destination: string;
  direction_label: string;
  total_distance_meters: number;
  stop_count: number;
  polyline: Location[];
  stops: ApiRouteStopResponse[];
}

export interface ApiRouteResponse {
  route_id: string;
  route_number: string;
  route_name: string;
  origin: string;
  destination: string;
  outbound_direction: string;
  inbound_direction: string;
  first_bus_time: string;
  last_bus_time: string;
  average_headway_minutes: number;
  directions: Record<Direction, ApiRouteDirectionResponse>;
  current_status?: Partial<Record<Direction, ApiRouteStatusResponse>>;
}

export interface ApiBusResponse {
  bus_id: string;
  vehicle_number: string;
  license_plate: string;
  driver_name: string;
  capacity: number;
  route_id: string;
  route_number: string;
  direction: Direction;
  current_position: Location;
  current_segment?: {
    index: number;
    from: Location;
    to: Location;
  };
  next_stop_id: string;
  next_stop_name: string;
  occupancy_level: Bus["occupancyLevel"];
  speed_kmh: number;
  status: Bus["status"];
  traffic_level: TrafficLevel;
  traffic_multiplier: number;
  eta_to_next_stop_minutes: number;
  updated_at: string;
}

export interface ApiBusLocationSocketEvent {
  bus_id: string;
  vehicle_number: string;
  license_plate: string;
  driver_name: string;
  capacity: number;
  route_id: string;
  route_number: string;
  direction: Direction;
  lat: number;
  lng: number;
  next_stop: {
    stop_id: string;
    name: string;
  };
  occupancy_level: Bus["occupancyLevel"];
  speed_kmh: number;
  status: Bus["status"];
  traffic_level: TrafficLevel;
  traffic_multiplier: number;
  eta: {
    estimated_arrival_time: string;
    minutes: number;
  };
  updated_at: string;
}

export interface ApiRouteStatusSocketEvent {
  route_id: string;
  route_number: string;
  direction: Direction;
  traffic_level: TrafficLevel;
  average_speed_kmh: number;
  average_delay_minutes: number;
  active_delay_reasons: string[];
  updated_at: string;
}

function hashRouteNumber(routeNumber: string) {
  return routeNumber
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), 0);
}

export function getRouteColor(routeNumber: string) {
  return (
    ROUTE_COLOR_BY_NUMBER[routeNumber] ??
    ROUTE_COLOR_FALLBACKS[hashRouteNumber(routeNumber) % ROUTE_COLOR_FALLBACKS.length]
  );
}

function mapRouteStatus(status: ApiRouteStatusResponse): RouteStatus {
  return {
    direction: status.direction,
    trafficLevel: status.traffic_level,
    averageSpeedKmh: status.average_speed_kmh,
    averageDelayMinutes: status.average_delay_minutes,
    activeDelayReasons: status.active_delay_reasons,
    updatedAt: status.updated_at,
  };
}

function mapRouteAssignment(assignment: ApiRouteAssignmentResponse): RouteAssignment {
  return {
    routeId: assignment.route_id,
    routeNumber: assignment.route_number,
    routeName: assignment.route_name,
    direction: assignment.direction,
    sequence: assignment.sequence,
  };
}

function mapLocation(latitude: number, longitude: number): Location {
  return {
    lat: latitude,
    lng: longitude,
  };
}

export function mapEtaResponse(eta: ApiEtaResponse): Eta {
  return {
    busId: eta.bus_id,
    vehicleNumber: eta.vehicle_number,
    licensePlate: eta.license_plate,
    routeId: eta.route_id,
    routeNumber: eta.route_number,
    stopId: eta.stop_id,
    stopName: eta.stop_name,
    direction: eta.direction,
    estimatedArrivalDate: eta.estimated_arrival_time,
    minutes: eta.minutes,
    distanceMeters: eta.distance_meters,
    trafficLevel: eta.traffic_level,
    occupancyLevel: eta.occupancy_level,
  };
}

export function mapStopResponse(stop: ApiStopResponse): Stop {
  return {
    id: stop.stop_id,
    name: stop.stop_name,
    location: mapLocation(stop.latitude, stop.longitude),
    distance: stop.distance_meters,
    routeIds: stop.route_ids,
    landmark: stop.landmark,
    areaDescription: stop.area_description,
    isMajorStop: stop.is_major_stop,
    isInterchange: stop.is_interchange,
    routeAssignments: stop.route_assignments?.map(mapRouteAssignment),
    etaPredictions: stop.eta_predictions?.map(mapEtaResponse),
  };
}

function mapRouteDirection(
  id: Direction,
  direction: ApiRouteDirectionResponse,
  status?: RouteStatus,
): RouteDirection {
  return {
    id,
    label: direction.direction_label,
    origin: direction.origin,
    destination: direction.destination,
    polyline: direction.polyline,
    totalDistanceMeters: direction.total_distance_meters,
    stopCount: direction.stop_count,
    stops: direction.stops.map((stop) => ({
      id: stop.stop_id,
      name: stop.stop_name,
      location: mapLocation(stop.latitude, stop.longitude),
      sequence: stop.sequence,
      landmark: stop.landmark,
      areaDescription: stop.area_description,
      isMajorStop: stop.is_major_stop,
      isInterchange: stop.is_interchange,
    })),
    status,
  };
}

export function mapRouteResponse(route: ApiRouteResponse): Route {
  const currentStatus = route.current_status
    ? {
        outbound: route.current_status.outbound
          ? mapRouteStatus(route.current_status.outbound)
          : undefined,
        inbound: route.current_status.inbound
          ? mapRouteStatus(route.current_status.inbound)
          : undefined,
      }
    : undefined;

  return {
    id: route.route_id,
    name: route.route_number,
    description: route.route_name,
    color: getRouteColor(route.route_number),
    routeNumber: route.route_number,
    routeName: route.route_name,
    origin: route.origin,
    destination: route.destination,
    outboundDirection: route.outbound_direction,
    inboundDirection: route.inbound_direction,
    firstBusTime: route.first_bus_time,
    lastBusTime: route.last_bus_time,
    averageHeadwayMinutes: route.average_headway_minutes,
    directions: {
      outbound: mapRouteDirection(
        "outbound",
        route.directions.outbound,
        currentStatus?.outbound,
      ),
      inbound: mapRouteDirection(
        "inbound",
        route.directions.inbound,
        currentStatus?.inbound,
      ),
    },
    currentStatus,
  };
}

export function mapBusResponse(bus: ApiBusResponse): Bus {
  return {
    id: bus.bus_id,
    routeId: bus.route_id,
    routeNumber: bus.route_number,
    location: bus.current_position,
    lastUpdated: bus.updated_at,
    speed: bus.speed_kmh,
    direction: bus.direction,
    vehicleNumber: bus.vehicle_number,
    licensePlate: bus.license_plate,
    driverName: bus.driver_name,
    capacity: bus.capacity,
    nextStopId: bus.next_stop_id,
    nextStopName: bus.next_stop_name,
    occupancyLevel: bus.occupancy_level,
    status: bus.status,
    trafficLevel: bus.traffic_level,
    trafficMultiplier: bus.traffic_multiplier,
    etaToNextStopMinutes: bus.eta_to_next_stop_minutes,
    currentSegment: bus.current_segment,
  };
}

export function mergeRealtimeBusEvent(
  currentBus: Bus | undefined,
  payload: ApiBusLocationSocketEvent,
): Bus {
  return {
    id: payload.bus_id,
    routeId: payload.route_id,
    routeNumber: payload.route_number,
    location: {
      lat: payload.lat,
      lng: payload.lng,
    },
    lastUpdated: payload.updated_at,
    speed: payload.speed_kmh,
    direction: payload.direction,
    vehicleNumber: payload.vehicle_number,
    licensePlate: payload.license_plate ?? currentBus?.licensePlate,
    driverName: payload.driver_name ?? currentBus?.driverName,
    capacity: payload.capacity ?? currentBus?.capacity,
    nextStopId: payload.next_stop.stop_id,
    nextStopName: payload.next_stop.name,
    occupancyLevel: payload.occupancy_level,
    status: payload.status,
    trafficLevel: payload.traffic_level,
    trafficMultiplier: payload.traffic_multiplier,
    etaToNextStopMinutes: payload.eta.minutes,
    currentSegment: currentBus?.currentSegment,
  };
}

export function mergeRouteStatusPayload(
  route: Route,
  payload: ApiRouteStatusSocketEvent,
): Route {
  if (route.id !== payload.route_id) {
    return route;
  }

  const status: RouteStatus = {
    direction: payload.direction,
    trafficLevel: payload.traffic_level,
    averageSpeedKmh: payload.average_speed_kmh,
    averageDelayMinutes: payload.average_delay_minutes,
    activeDelayReasons: payload.active_delay_reasons,
    updatedAt: payload.updated_at,
  };

  return {
    ...route,
    currentStatus: {
      ...route.currentStatus,
      [payload.direction]: status,
    },
    directions: {
      ...route.directions,
      [payload.direction]: {
        ...route.directions[payload.direction],
        status,
      },
    },
  };
}
