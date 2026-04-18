import { Injectable, NotFoundException } from '@nestjs/common';
import { BANGKOK_ROUTE_SEEDS, BANGKOK_STOPS } from './bangkok-transit.data';
import {
  BusStatus,
  BusState,
  DelayEvent,
  DirectionId,
  EtaPrediction,
  OccupancyLevel,
  RouteSeed,
  RouteDirectionState,
  RouteState,
  RouteStatusSnapshot,
  RouteStopState,
  StopState,
  TrafficLevel,
  TrafficPeriod,
} from './transit.types';
import {
  buildCumulativeDistances,
  clampLoopDistance,
  distanceAlongPolylineForPoint,
  findSegmentIndex,
  interpolateOnPolyline,
  minutesFromDistance,
  remainingDistance,
  distanceInMeters,
} from './geo.utils';
import {
  getBaseTrafficMultiplier,
  getDirectionalDemandBoost,
  getTrafficLevel,
  getTrafficPeriod,
  getTrafficSpeedFloorKmh,
  getZoneTrafficMultiplier,
} from './traffic.utils';

const NEAR_STOP_DISTANCE_METERS = 140;
const GLOBAL_MAX_BUS_SPEED_KMH = 80;
const ROUTE_CAPACITY_BY_NUMBER: Record<string, number> = {
  '8': 74,
  '26': 72,
  '29': 72,
  '34': 76,
  '59': 76,
  '77': 68,
  '145': 74,
  '510': 80,
  '511': 80,
};
const ROUTE_DEMAND_PROFILE: Record<string, number> = {
  '8': 0.08,
  '26': 0.04,
  '29': 0.07,
  '34': 0.03,
  '59': 0.05,
  '77': 0.02,
  '145': 0.04,
  '510': 0.03,
  '511': 0.08,
};
const TRANSIT_HUB_STOP_IDS = new Set([
  'stop_victory_monument',
  'stop_siam',
  'stop_chatuchak_park',
  'stop_mochit_bus_terminal',
  'stop_hua_lamphong',
  'stop_bang_kapi',
  'stop_wongwian_yai',
  'stop_ari',
  'stop_sanam_pao',
  'stop_lak_si',
  'stop_don_mueang_airport',
  'stop_suvarnabhumi_airport',
  'stop_bang_na',
  'stop_pak_nam',
]);
const CAMPUS_AND_MARKET_STOP_IDS = new Set([
  'stop_kasetsart_university',
  'stop_ramkhamhaeng_24',
  'stop_samyan',
  'stop_pratunam',
  'stop_rangsit_market',
  'stop_minburi_market',
  'stop_fashion_island',
  'stop_mega_bangna',
  'stop_thammasat_rangsit',
]);
const DRIVER_FIRST_NAMES = [
  'Somchai',
  'Nattapong',
  'Prasert',
  'Anan',
  'Surasak',
  'Chutima',
  'Kanya',
  'Suda',
  'Jirawat',
  'Wiroj',
  'Pimchanok',
  'Thanakorn',
];
const DRIVER_LAST_NAMES = [
  'Suksawat',
  'Charoen',
  'Kittisak',
  'Boonmee',
  'Pradit',
  'Saelim',
  'Kaewdee',
  'Tansakul',
  'Phromma',
  'Intara',
  'Rattanakul',
  'Maneerat',
];

@Injectable()
export class TransitStateService {
  private readonly routes = new Map<string, RouteState>();
  private readonly stops = new Map<string, StopState>();
  private readonly buses = new Map<string, BusState>();
  private readonly delayEvents = new Map<string, DelayEvent>();

  constructor() {
    this.seedTransitData();
    this.refreshOperationalState(Date.now());
  }

  getRoutes() {
    return Array.from(this.routes.values()).map((route) => ({
      route_id: route.routeId,
      route_number: route.routeNumber,
      route_name: route.routeName,
      origin: route.origin,
      destination: route.destination,
      outbound_direction: route.outboundDirection,
      inbound_direction: route.inboundDirection,
      first_bus_time: route.firstBusTime,
      last_bus_time: route.lastBusTime,
      average_headway_minutes: route.averageHeadwayMinutes,
      directions: {
        outbound: this.toDirectionResponse(route.directions.outbound),
        inbound: this.toDirectionResponse(route.directions.inbound),
      },
      current_status: this.getRouteStatusByRoute(route.routeId),
    }));
  }

  getRoute(routeId: string) {
    const route = this.mustGetRoute(routeId);

    return {
      route_id: route.routeId,
      route_number: route.routeNumber,
      route_name: route.routeName,
      origin: route.origin,
      destination: route.destination,
      outbound_direction: route.outboundDirection,
      inbound_direction: route.inboundDirection,
      first_bus_time: route.firstBusTime,
      last_bus_time: route.lastBusTime,
      average_headway_minutes: route.averageHeadwayMinutes,
      directions: {
        outbound: this.toDirectionResponse(route.directions.outbound),
        inbound: this.toDirectionResponse(route.directions.inbound),
      },
      active_vehicles: this.getRouteVehicles(routeId),
      current_status: this.getRouteStatusByRoute(route.routeId),
    };
  }

  getStops() {
    return Array.from(this.stops.values())
      .map((stop) => this.toStopResponse(stop))
      .sort((left, right) => left.stop_name.localeCompare(right.stop_name));
  }

  getStop(stopId: string) {
    const stop = this.mustGetStop(stopId);

    return {
      ...this.toStopResponse(stop),
      eta_predictions: this.getEtaPredictions(stopId),
    };
  }

  getNearbyStops(lat: number, lng: number, radius = 1000) {
    const origin = { lat, lng };

    return this.getStops()
      .map((stop) => ({
        ...stop,
        distance_meters: Math.round(
          distanceInMeters(origin, {
            lat: stop.latitude,
            lng: stop.longitude,
          }),
        ),
      }))
      .filter((stop) => stop.distance_meters <= radius)
      .sort((left, right) => left.distance_meters - right.distance_meters)
      .slice(0, 20);
  }

  getLiveBuses(routeId?: string) {
    this.refreshOperationalState(Date.now());

    return Array.from(this.buses.values())
      .filter((bus) => !routeId || bus.routeId === routeId)
      .map((bus) => this.toBusResponse(bus))
      .sort((left, right) => {
        if (left.route_number === right.route_number) {
          return left.vehicle_number.localeCompare(right.vehicle_number);
        }

        return left.route_number.localeCompare(right.route_number);
      });
  }

  getRouteVehicles(routeId: string) {
    this.mustGetRoute(routeId);
    return this.getLiveBuses(routeId);
  }

  getEtaPredictions(stopId: string) {
    const stop = this.mustGetStop(stopId);
    const now = Date.now();
    this.refreshOperationalState(now);

    const predictions: EtaPrediction[] = [];

    Array.from(this.buses.values()).forEach((bus) => {
      const route = this.mustGetRoute(bus.routeId);
      const directionState = route.directions[bus.direction];
      const routeStop = directionState.stops.find(
        (candidate) => candidate.stopId === stop.stopId,
      );

      if (!routeStop) {
        return;
      }

      const { minutes, distanceMeters } = this.calculateEtaForStop(
        bus,
        directionState,
        routeStop.distanceFromStartMeters,
        now,
      );

      predictions.push({
        stopId: stop.stopId,
        busId: bus.busId,
        vehicleNumber: bus.vehicleNumber,
        licensePlate: bus.licensePlate,
        routeId: bus.routeId,
        routeNumber: bus.routeNumber,
        direction: bus.direction,
        estimatedArrivalTime: new Date(
          now + minutes * 60 * 1000,
        ).toISOString(),
        minutes,
        distanceMeters,
        trafficLevel: getTrafficLevel(bus.trafficMultiplier),
        occupancyLevel: bus.occupancyLevel,
      });
    });

    return predictions
      .sort((left, right) => left.minutes - right.minutes)
      .map((prediction) => ({
        stop_id: prediction.stopId,
        stop_name: stop.stopName,
        bus_id: prediction.busId,
        vehicle_number: prediction.vehicleNumber,
        license_plate: prediction.licensePlate,
        route_id: prediction.routeId,
        route_number: prediction.routeNumber,
        direction: prediction.direction,
        estimated_arrival_time: prediction.estimatedArrivalTime,
        minutes: prediction.minutes,
        distance_meters: Math.round(prediction.distanceMeters),
        traffic_level: prediction.trafficLevel,
        occupancy_level: prediction.occupancyLevel,
      }));
  }

  getNextStopEtaForBus(busId: string) {
    const bus = this.mustGetBus(busId);
    const route = this.mustGetRoute(bus.routeId);
    const directionState = route.directions[bus.direction];
    const nextStop = directionState.stops.find(
      (stop) => stop.stopId === bus.nextStopId,
    ) ?? directionState.stops[0];
    const now = Date.now();

    const { minutes, distanceMeters } = this.calculateEtaForStop(
      bus,
      directionState,
      nextStop.distanceFromStartMeters,
      now,
    );

    return {
      stop_id: nextStop.stopId,
      stop_name: nextStop.stopName,
      bus_id: bus.busId,
      vehicle_number: bus.vehicleNumber,
      license_plate: bus.licensePlate,
      route_id: bus.routeId,
      route_number: bus.routeNumber,
      direction: bus.direction,
      estimated_arrival_time: new Date(
        now + minutes * 60 * 1000,
      ).toISOString(),
      minutes,
      distance_meters: Math.round(distanceMeters),
      traffic_level: getTrafficLevel(bus.trafficMultiplier),
      occupancy_level: bus.occupancyLevel,
    };
  }

  getRouteStatusSnapshots(routeId?: string) {
    this.refreshOperationalState(Date.now());

    const selectedRoutes = routeId
      ? [this.mustGetRoute(routeId)]
      : Array.from(this.routes.values());

    return selectedRoutes.flatMap((route) =>
      (['outbound', 'inbound'] as DirectionId[]).map((direction) =>
        this.buildRouteStatusSnapshot(route, direction),
      ),
    );
  }

  getRealtimeRouteStatusPayloads(routeId?: string) {
    return this.getRouteStatusSnapshots(routeId).map((snapshot) => ({
      route_id: snapshot.routeId,
      route_number: snapshot.routeNumber,
      direction: snapshot.direction,
      traffic_level: snapshot.trafficLevel,
      average_speed_kmh: snapshot.averageSpeedKmh,
      average_delay_minutes: snapshot.averageDelayMinutes,
      active_delay_reasons: snapshot.activeDelayReasons,
      updated_at: snapshot.updatedAt,
    }));
  }

  advanceSimulation(elapsedMs: number, timestampMs = Date.now()) {
    this.refreshDelayEvents(timestampMs);
    this.maybeCreateDelayEvent(timestampMs);

    Array.from(this.buses.values()).forEach((bus) => {
      this.advanceBus(bus, elapsedMs, timestampMs);
    });

    return this.getLiveBuses();
  }

  getRealtimeBusPayload(busId: string) {
    const bus = this.mustGetBus(busId);
    const eta = this.getNextStopEtaForBus(busId);

    return {
      bus_id: bus.busId,
      vehicle_number: bus.vehicleNumber,
      license_plate: bus.licensePlate,
      driver_name: bus.driverName,
      capacity: bus.capacity,
      route_id: bus.routeId,
      route_number: bus.routeNumber,
      direction: bus.direction,
      lat: bus.currentPosition.lat,
      lng: bus.currentPosition.lng,
      next_stop: {
        stop_id: eta.stop_id,
        name: eta.stop_name,
      },
      occupancy_level: bus.occupancyLevel,
      speed_kmh: bus.speedKmh,
      status: bus.status,
      traffic_level: getTrafficLevel(bus.trafficMultiplier),
      traffic_multiplier: Number(bus.trafficMultiplier.toFixed(2)),
      eta: {
        estimated_arrival_time: eta.estimated_arrival_time,
        minutes: eta.minutes,
      },
      updated_at: bus.updatedAt,
    };
  }

  getRealtimeEtaPayload(busId: string) {
    return this.getNextStopEtaForBus(busId);
  }

  getAllBusIds() {
    return Array.from(this.buses.keys());
  }

  getBusMasterRecords() {
    return Array.from(this.buses.values())
      .map((bus) => ({
        busId: bus.busId,
        vehicleNumber: bus.vehicleNumber,
        licensePlate: bus.licensePlate,
        capacity: bus.capacity,
        routeId: bus.routeId,
        routeNumber: bus.routeNumber,
        direction: bus.direction,
        depotName: this.getDepotNameForRoute(bus.routeNumber),
        serviceStatus: this.getBusServiceStatus(bus.status),
        driver: this.buildDriverProfile(bus.busId, bus.driverName, bus.routeNumber),
      }))
      .sort((left, right) => left.vehicleNumber.localeCompare(right.vehicleNumber));
  }

  private seedTransitData() {
    BANGKOK_STOPS.forEach((stop) => {
      this.stops.set(stop.stopId, {
        ...stop,
        routeIds: [],
        assignments: [],
      });
    });

    BANGKOK_ROUTE_SEEDS.forEach((routeSeed) => {
      const directions = {
        outbound: this.buildDirectionState(routeSeed, 'outbound'),
        inbound: this.buildDirectionState(routeSeed, 'inbound'),
      };

      const routeState: RouteState = {
        ...routeSeed,
        directions,
      };

      this.routes.set(routeState.routeId, routeState);
      this.seedVehiclesForRoute(routeState);
    });
  }

  private buildDirectionState(
    route: RouteSeed,
    direction: DirectionId,
  ): RouteDirectionState {
    const directionSeed = route.directions[direction];
    const cumulativeDistances = buildCumulativeDistances(directionSeed.polyline);
    const totalDistanceMeters =
      cumulativeDistances[cumulativeDistances.length - 1] ?? 0;

    const stops = directionSeed.stopIds.map((stopId, index) => {
      const stop = this.mustGetStop(stopId);
      const routeStop: RouteStopState = {
        ...stop,
        sequence: index + 1,
        distanceFromStartMeters: distanceAlongPolylineForPoint(
          directionSeed.polyline,
          cumulativeDistances,
          stop.location,
        ),
      };

      stop.routeIds = Array.from(new Set([...stop.routeIds, route.routeId]));
      stop.assignments.push({
        routeId: route.routeId,
        routeNumber: route.routeNumber,
        routeName: route.routeName,
        direction,
        sequence: index + 1,
      });

      return routeStop;
    });

    return {
      ...directionSeed,
      stops,
      cumulativeDistances,
      totalDistanceMeters,
    };
  }

  private seedVehiclesForRoute(route: RouteState) {
    (['outbound', 'inbound'] as DirectionId[]).forEach((direction) => {
      const directionState = route.directions[direction];
      const estimatedTravelMinutes =
        ((directionState.totalDistanceMeters / 1000) / route.baseCruiseSpeedKmh) *
          60 +
        directionState.stops.length * 0.45;
      const vehiclesPerDirection = this.getVehiclesPerDirection(
        route,
        estimatedTravelMinutes,
      );
      const spacingMeters =
        directionState.totalDistanceMeters / Math.max(vehiclesPerDirection, 1);

      for (let index = 0; index < vehiclesPerDirection; index += 1) {
        const vehicleVarianceMeters =
          ((index % 2 === 0 ? 1 : -1) *
            Math.min(spacingMeters * 0.12, 850)) /
          2;
        const distanceAlongRouteMeters = clampLoopDistance(
          spacingMeters * index +
            vehicleVarianceMeters +
            (direction === 'inbound' ? spacingMeters / 2 : 0),
          directionState.totalDistanceMeters,
        );
        const currentPosition = interpolateOnPolyline(
          directionState.polyline,
          directionState.cumulativeDistances,
          distanceAlongRouteMeters,
        );
        const nextStop = this.findUpcomingStop(directionState, distanceAlongRouteMeters);
        const vehicleSuffix = String(index + 1).padStart(2, '0');
        const busId = `${route.routeId}_${direction}_${vehicleSuffix}`;
        const occupancyLoad = this.calculateTargetOccupancyLoad(
          route,
          directionState,
          direction,
          nextStop,
          busId,
          getTrafficPeriod(Date.now()),
          distanceAlongRouteMeters,
        );

        this.buses.set(busId, {
          busId,
          vehicleNumber: `${route.routeNumber}-${direction === 'outbound' ? 'O' : 'I'}${vehicleSuffix}`,
          licensePlate: this.buildLicensePlate(route.routeNumber, direction, index),
          driverName: this.buildDriverName(busId),
          capacity: this.getCapacityForRoute(route.routeNumber),
          routeId: route.routeId,
          routeNumber: route.routeNumber,
          direction,
          distanceAlongRouteMeters,
          currentPosition,
          currentSegmentIndex: findSegmentIndex(
            directionState.cumulativeDistances,
            distanceAlongRouteMeters,
          ),
          nextStopId: nextStop.stopId,
          occupancyLevel: this.mapOccupancyLoadToLevel(occupancyLoad),
          occupancyLoad,
          speedKmh: Math.min(route.baseCruiseSpeedKmh, route.maxSpeedKmh),
          baseSpeedKmh: Math.min(
            route.baseCruiseSpeedKmh + ((index % 3) - 1),
            route.maxSpeedKmh - 2,
          ),
          maxSpeedKmh: Math.min(route.maxSpeedKmh, GLOBAL_MAX_BUS_SPEED_KMH),
          status: 'running',
          trafficMultiplier: 1,
          updatedAt: new Date().toISOString(),
          dwellUntilMs: null,
          layoverUntilMs: null,
          activeDelayEventId: null,
        });
      }
    });
  }

  private refreshOperationalState(now: number) {
    Array.from(this.buses.values()).forEach((bus) => {
      this.applyTrafficAndDemandState(bus, now);
    });
  }

  private advanceBus(bus: BusState, elapsedMs: number, now: number) {
    this.applyTrafficAndDemandState(bus, now);
    const route = this.mustGetRoute(bus.routeId);
    const directionState = route.directions[bus.direction];

    if (bus.layoverUntilMs && now < bus.layoverUntilMs) {
      bus.speedKmh = 0;
      bus.status = 'out_of_service';
      bus.currentPosition = directionState.stops[0].location;
      bus.currentSegmentIndex = 0;
      bus.nextStopId = directionState.stops[0].stopId;
      bus.updatedAt = new Date(now).toISOString();
      return;
    }

    if (bus.layoverUntilMs && now >= bus.layoverUntilMs) {
      bus.layoverUntilMs = null;
    }

    if (bus.dwellUntilMs && now < bus.dwellUntilMs) {
      bus.speedKmh = 0;
      bus.status = 'at_stop';
      bus.updatedAt = new Date(now).toISOString();
      return;
    }

    if (bus.dwellUntilMs && now >= bus.dwellUntilMs) {
      bus.dwellUntilMs = null;
    }

    const upcomingStop = this.findUpcomingStop(
      directionState,
      bus.distanceAlongRouteMeters,
    );
    const distanceToNextStop = Math.max(
      upcomingStop.distanceFromStartMeters - bus.distanceAlongRouteMeters,
      0,
    );

    const trafficLevel = getTrafficLevel(bus.trafficMultiplier);
    const roadSpeedCap = this.getRoadSpeedCapKmh(
      route,
      upcomingStop,
      getTrafficPeriod(now),
      trafficLevel,
    );
    const cruiseSpeed = Math.min(
      roadSpeedCap,
      bus.maxSpeedKmh,
      Math.max(
        bus.baseSpeedKmh * bus.trafficMultiplier,
        getTrafficSpeedFloorKmh(bus.baseSpeedKmh, trafficLevel),
      ),
    );
    let effectiveSpeed = cruiseSpeed;

    if (distanceToNextStop <= NEAR_STOP_DISTANCE_METERS) {
      const nearStopFactor = distanceToNextStop <= 40 ? 0.52 : 0.74;
      const nearStopFloor =
        distanceToNextStop <= 40
          ? Math.max(6, getTrafficSpeedFloorKmh(bus.baseSpeedKmh, trafficLevel) * 0.4)
          : Math.max(10, getTrafficSpeedFloorKmh(bus.baseSpeedKmh, trafficLevel) * 0.52);

      effectiveSpeed = Math.max(cruiseSpeed * nearStopFactor, nearStopFloor);
    }

    const distanceDelta = (effectiveSpeed * 1000 * elapsedMs) / 3_600_000;

    if (distanceToNextStop <= 20 || distanceDelta >= distanceToNextStop) {
      this.arriveAtStop(bus, route, directionState, upcomingStop, now);
      return;
    }

    bus.distanceAlongRouteMeters = clampLoopDistance(
      bus.distanceAlongRouteMeters + distanceDelta,
      directionState.totalDistanceMeters,
    );
    bus.currentPosition = interpolateOnPolyline(
      directionState.polyline,
      directionState.cumulativeDistances,
      bus.distanceAlongRouteMeters,
    );
    bus.currentSegmentIndex = findSegmentIndex(
      directionState.cumulativeDistances,
      bus.distanceAlongRouteMeters,
    );
    bus.nextStopId = upcomingStop.stopId;
    bus.speedKmh = Number(effectiveSpeed.toFixed(1));
    bus.status =
      bus.activeDelayEventId && effectiveSpeed < bus.baseSpeedKmh * 0.72
        ? 'delayed'
        : distanceToNextStop <= NEAR_STOP_DISTANCE_METERS
          ? 'near_stop'
          : 'running';
    bus.updatedAt = new Date(now).toISOString();
  }

  private arriveAtStop(
    bus: BusState,
    route: RouteState,
    directionState: RouteDirectionState,
    stop: RouteStopState,
    now: number,
  ) {
    bus.distanceAlongRouteMeters = stop.distanceFromStartMeters;
    bus.currentPosition = stop.location;
    bus.currentSegmentIndex = findSegmentIndex(
      directionState.cumulativeDistances,
      bus.distanceAlongRouteMeters,
    );
    bus.nextStopId = stop.stopId;
    bus.speedKmh = 0;
    bus.updatedAt = new Date(now).toISOString();

    const isTerminalStop = stop.sequence === directionState.stops.length;

    if (isTerminalStop) {
      const nextDirection: DirectionId =
        bus.direction === 'outbound' ? 'inbound' : 'outbound';
      const nextDirectionState = route.directions[nextDirection];

      bus.direction = nextDirection;
      bus.distanceAlongRouteMeters = 0;
      bus.currentPosition = nextDirectionState.stops[0].location;
      bus.currentSegmentIndex = 0;
      bus.nextStopId = nextDirectionState.stops[0].stopId;
      bus.layoverUntilMs =
        now + this.calculateTerminalLayoverMs(stop, getTrafficPeriod(now));
      bus.status = 'out_of_service';
      bus.activeDelayEventId = null;
      return;
    }

    bus.dwellUntilMs =
      now +
      this.calculateDwellTimeMs(
        stop,
        bus.occupancyLevel,
        getTrafficPeriod(now),
        bus.occupancyLoad,
      );
    bus.status = 'at_stop';
  }

  private applyTrafficAndDemandState(bus: BusState, now: number) {
    const route = this.mustGetRoute(bus.routeId);
    const directionState = route.directions[bus.direction];
    const period = getTrafficPeriod(now);
    const currentOrUpcomingStop = this.findUpcomingStop(
      directionState,
      bus.distanceAlongRouteMeters,
    );
    const activeDelay = this.findActiveDelay(route.routeId, bus.direction, now);
    const baseMultiplier = getBaseTrafficMultiplier(period);
    const zoneMultiplier = this.getBlendedZoneTrafficMultiplier(
      directionState,
      bus.distanceAlongRouteMeters,
      period,
    );
    const directionalMultiplier = this.getDirectionalTrafficBiasMultiplier(
      route,
      bus.direction,
      period,
    );
    const corridorMultiplier = this.getCorridorTrafficMultiplier(
      directionState,
      bus.distanceAlongRouteMeters,
      period,
    );
    const waveMultiplier = this.getRealtimeTrafficWaveMultiplier(
      route,
      directionState,
      bus,
      period,
      now,
    );
    const delayMultiplier = activeDelay?.multiplier ?? 1;
    const multiplier = Math.max(
      0.42,
      Math.min(
        baseMultiplier *
          zoneMultiplier *
          directionalMultiplier *
          corridorMultiplier *
          waveMultiplier *
          delayMultiplier,
        1.15,
      ),
    );
    const trafficLevel = getTrafficLevel(multiplier);
    const targetOccupancyLoad = this.calculateTargetOccupancyLoad(
      route,
      directionState,
      bus.direction,
      currentOrUpcomingStop,
      bus.busId,
      period,
      bus.distanceAlongRouteMeters,
    );
    const occupancyBlendFactor =
      bus.status === 'at_stop' ? 0.34 : bus.status === 'near_stop' ? 0.24 : 0.14;

    bus.trafficMultiplier = multiplier;
    bus.activeDelayEventId = activeDelay?.eventId ?? null;
    bus.occupancyLoad = this.blendOccupancyLoad(
      bus.occupancyLoad,
      targetOccupancyLoad,
      occupancyBlendFactor,
    );
    bus.occupancyLevel = this.mapOccupancyLoadToLevel(bus.occupancyLoad);

    if (!bus.dwellUntilMs && !bus.layoverUntilMs) {
      const roadSpeedCap = this.getRoadSpeedCapKmh(
        route,
        currentOrUpcomingStop,
        period,
        trafficLevel,
      );
      bus.speedKmh = Number(
        Math.min(
          roadSpeedCap,
          bus.maxSpeedKmh,
          Math.max(
            bus.baseSpeedKmh * multiplier,
            getTrafficSpeedFloorKmh(bus.baseSpeedKmh, trafficLevel),
          ),
        ).toFixed(1),
      );
      bus.status = activeDelay ? 'delayed' : bus.status;
    }

    bus.updatedAt = new Date(now).toISOString();
  }

  private getVehiclesPerDirection(
    route: RouteState,
    estimatedTravelMinutes: number,
  ) {
    if (route.targetVehiclesPerDirection) {
      return route.targetVehiclesPerDirection;
    }

    const calculatedVehicles = Math.round(
      estimatedTravelMinutes / route.averageHeadwayMinutes,
    );

    switch (route.serviceLevel) {
      case 'express':
        return Math.max(5, Math.min(8, calculatedVehicles));
      case 'trunk':
        return Math.max(6, Math.min(9, calculatedVehicles + 1));
      case 'local':
      default:
        return Math.max(4, Math.min(7, calculatedVehicles));
    }
  }

  private getRoadSpeedCapKmh(
    route: RouteState,
    upcomingStop: RouteStopState,
    period: TrafficPeriod,
    trafficLevel: TrafficLevel,
  ) {
    let capByZone = 58;

    switch (upcomingStop.zone) {
      case 'cbd':
        capByZone = 48;
        break;
      case 'interchange':
        capByZone = 52;
        break;
      case 'river_crossing':
        capByZone = 46;
        break;
      case 'arterial':
        capByZone = 62;
        break;
      case 'suburban':
      default:
        capByZone = 72;
        break;
    }

    if (route.serviceLevel === 'express' && upcomingStop.zone !== 'cbd') {
      capByZone += 8;
    }

    if (route.routeNumber === '145' && upcomingStop.zone !== 'cbd') {
      capByZone += 4;
    }

    if (period === 'late_evening' || period === 'night') {
      capByZone += 6;
    }

    if (trafficLevel === 'moderate') {
      capByZone -= 2;
    } else if (trafficLevel === 'heavy') {
      capByZone -= 7;
    } else if (trafficLevel === 'severe') {
      capByZone -= 14;
    }

    return Math.min(
      GLOBAL_MAX_BUS_SPEED_KMH,
      Math.max(20, Math.min(route.maxSpeedKmh, capByZone)),
    );
  }

  private getBlendedZoneTrafficMultiplier(
    directionState: RouteDirectionState,
    currentDistanceMeters: number,
    period: TrafficPeriod,
  ) {
    const stops = directionState.stops;

    if (stops.length === 0) {
      return 1;
    }

    if (stops.length === 1) {
      return getZoneTrafficMultiplier(stops[0].zone, period);
    }

    const nextStopIndex = stops.findIndex(
      (stop) => stop.distanceFromStartMeters > currentDistanceMeters + 1,
    );

    const previousStop =
      nextStopIndex <= 0
        ? stops[0]
        : nextStopIndex === -1
          ? stops[stops.length - 2]
          : stops[nextStopIndex - 1];
    const nextStop =
      nextStopIndex <= 0
        ? stops[1]
        : nextStopIndex === -1
          ? stops[stops.length - 1]
          : stops[nextStopIndex];

    if (previousStop.stopId === nextStop.stopId) {
      return getZoneTrafficMultiplier(nextStop.zone, period);
    }

    const segmentLength = Math.max(
      nextStop.distanceFromStartMeters - previousStop.distanceFromStartMeters,
      1,
    );
    const segmentProgress = Math.min(
      1,
      Math.max(
        0,
        (currentDistanceMeters - previousStop.distanceFromStartMeters) /
          segmentLength,
      ),
    );
    const previousMultiplier = getZoneTrafficMultiplier(previousStop.zone, period);
    const nextMultiplier = getZoneTrafficMultiplier(nextStop.zone, period);

    return Number(
      (
        previousMultiplier * (1 - segmentProgress) +
        nextMultiplier * segmentProgress
      ).toFixed(3),
    );
  }

  private getDirectionalTrafficBiasMultiplier(
    route: RouteState,
    direction: DirectionId,
    period: TrafficPeriod,
  ) {
    if (period === 'morning_peak' && route.morningPeakFlow !== 'balanced') {
      return route.morningPeakFlow === direction ? 0.96 : 1.02;
    }

    if (period === 'evening_peak' && route.eveningPeakFlow !== 'balanced') {
      return route.eveningPeakFlow === direction ? 0.95 : 1.03;
    }

    if (period === 'midday') {
      return 0.99;
    }

    return 1;
  }

  private getCorridorTrafficMultiplier(
    directionState: RouteDirectionState,
    currentDistanceMeters: number,
    period: TrafficPeriod,
  ) {
    const influenceRadiusMeters =
      period === 'night' ? 650 : period === 'late_evening' ? 850 : 1_150;
    const maxPenalty =
      period === 'morning_peak' || period === 'evening_peak'
        ? 0.13
        : period === 'midday'
          ? 0.09
          : 0.06;

    const congestionPenalty = directionState.stops.reduce((penalty, stop) => {
      const distanceToStop = Math.abs(
        stop.distanceFromStartMeters - currentDistanceMeters,
      );

      if (distanceToStop > influenceRadiusMeters) {
        return penalty;
      }

      let stopPenalty = 0.01;

      switch (stop.zone) {
        case 'river_crossing':
          stopPenalty += 0.08;
          break;
        case 'interchange':
          stopPenalty += 0.07;
          break;
        case 'cbd':
          stopPenalty += 0.06;
          break;
        case 'arterial':
          stopPenalty += 0.04;
          break;
        case 'suburban':
        default:
          stopPenalty += 0.02;
          break;
      }

      if (stop.isMajorStop) {
        stopPenalty += 0.02;
      }

      if (stop.isInterchange) {
        stopPenalty += 0.025;
      }

      const distanceWeight = 1 - distanceToStop / influenceRadiusMeters;
      return penalty + stopPenalty * distanceWeight;
    }, 0);

    return Math.max(0.84, 1 - Math.min(congestionPenalty, maxPenalty));
  }

  private getRealtimeTrafficWaveMultiplier(
    route: RouteState,
    directionState: RouteDirectionState,
    bus: BusState,
    period: TrafficPeriod,
    now: number,
  ) {
    const amplitude =
      period === 'morning_peak'
        ? 0.08
        : period === 'evening_peak'
          ? 0.1
          : period === 'midday'
            ? 0.06
            : period === 'late_evening'
              ? 0.04
              : period === 'night'
                ? 0.02
                : 0.03;
    const routeBias = ['8', '29', '511'].includes(route.routeNumber) ? 0.01 : 0;
    const totalAmplitude = amplitude + routeBias;
    const routeProgress =
      directionState.totalDistanceMeters > 0
        ? bus.distanceAlongRouteMeters / directionState.totalDistanceMeters
        : 0;
    const phaseSeed = this.hashSeed(`${route.routeId}:${bus.direction}:${bus.busId}`);
    const primaryWave = Math.sin(now / 180_000 + routeProgress * Math.PI * 2 + phaseSeed);
    const secondaryWave = Math.cos(
      now / 260_000 + routeProgress * Math.PI * 4 + phaseSeed * 1.7,
    );
    const waveDelta = (primaryWave * 0.65 + secondaryWave * 0.35) * totalAmplitude;

    return Math.min(1.04, Math.max(1 - totalAmplitude, 1 + waveDelta));
  }

  private hashSeed(value: string) {
    return (
      value.split('').reduce((total, character, index) => {
        return total + character.charCodeAt(0) * (index + 1);
      }, 0) / 100
    );
  }

  private calculateTargetOccupancyLoad(
    route: RouteState,
    directionState: RouteDirectionState,
    direction: DirectionId,
    stop: RouteStopState,
    busId: string,
    period: TrafficPeriod,
    currentDistanceMeters: number,
  ) {
    const routeProgress =
      directionState.totalDistanceMeters > 0
        ? currentDistanceMeters / directionState.totalDistanceMeters
        : 0;
    const directionalBoost =
      (getDirectionalDemandBoost(
        period,
        direction,
        route.morningPeakFlow,
        route.eveningPeakFlow,
      ) -
        0.45) *
      0.09;
    let load =
      this.getBaseOccupancyLoad(period) +
      directionalBoost +
      this.getRouteDemandOffset(route, period) +
      this.getServiceLevelOccupancyOffset(route, period) +
      this.getStopZoneOccupancyOffset(stop, period) +
      this.getStopHotspotOccupancyOffset(stop, period) +
      this.getDirectionalProgressOccupancyOffset(route, direction, period, routeProgress) +
      this.hashBusId(busId) * 0.18;

    if (stop.isMajorStop) {
      load += 0.025;
    }

    if (stop.isInterchange) {
      load += 0.035;
    }

    return Math.min(0.98, Math.max(0.08, Number(load.toFixed(3))));
  }

  private getBaseOccupancyLoad(period: TrafficPeriod) {
    switch (period) {
      case 'early_morning':
        return 0.18;
      case 'morning_peak':
        return 0.34;
      case 'midday':
        return 0.26;
      case 'evening_peak':
        return 0.38;
      case 'late_evening':
        return 0.2;
      case 'night':
      default:
        return 0.1;
    }
  }

  private getRouteDemandOffset(route: RouteState, period: TrafficPeriod) {
    const baseOffset = ROUTE_DEMAND_PROFILE[route.routeNumber] ?? 0.04;

    switch (period) {
      case 'morning_peak':
      case 'evening_peak':
        return baseOffset;
      case 'midday':
        return baseOffset * 0.85;
      case 'early_morning':
        return baseOffset * 0.65;
      case 'late_evening':
        return baseOffset * 0.55;
      case 'night':
      default:
        return baseOffset * 0.35;
    }
  }

  private getServiceLevelOccupancyOffset(
    route: RouteState,
    period: TrafficPeriod,
  ) {
    const baseOffset =
      route.serviceLevel === 'trunk'
        ? 0.02
        : route.serviceLevel === 'express'
          ? route.routeNumber === '510'
            ? 0.005
            : 0.015
          : 0;

    if (period === 'night') {
      return baseOffset * 0.3;
    }

    if (period === 'late_evening') {
      return baseOffset * 0.55;
    }

    if (period === 'midday') {
      return baseOffset * 0.85;
    }

    if (period === 'early_morning') {
      return baseOffset * 0.7;
    }

    switch (route.serviceLevel) {
      case 'trunk':
        return baseOffset;
      case 'express':
        return baseOffset;
      case 'local':
      default:
        return 0;
    }
  }

  private getStopZoneOccupancyOffset(
    stop: RouteStopState,
    period: TrafficPeriod,
  ) {
    switch (stop.zone) {
      case 'cbd':
        if (period === 'morning_peak' || period === 'evening_peak') return 0.06;
        if (period === 'midday') return 0.045;
        if (period === 'late_evening') return 0.02;
        return -0.02;
      case 'interchange':
        if (period === 'morning_peak' || period === 'evening_peak') return 0.055;
        if (period === 'midday') return 0.04;
        if (period === 'late_evening') return 0.02;
        return 0.01;
      case 'river_crossing':
        if (period === 'morning_peak' || period === 'evening_peak') return 0.05;
        if (period === 'midday') return 0.03;
        return 0.01;
      case 'arterial':
        if (period === 'morning_peak' || period === 'evening_peak') return 0.03;
        if (period === 'midday') return 0.02;
        return 0;
      case 'suburban':
      default:
        if (period === 'early_morning') return 0.02;
        if (period === 'morning_peak' || period === 'evening_peak') return 0.015;
        if (period === 'night') return -0.02;
        return 0;
    }
  }

  private getStopHotspotOccupancyOffset(
    stop: RouteStopState,
    period: TrafficPeriod,
  ) {
    let offset = 0;

    if (TRANSIT_HUB_STOP_IDS.has(stop.stopId)) {
      if (period === 'morning_peak' || period === 'evening_peak') {
        offset += 0.05;
      } else if (period === 'midday') {
        offset += 0.035;
      } else if (period === 'late_evening') {
        offset += 0.02;
      }
    }

    if (CAMPUS_AND_MARKET_STOP_IDS.has(stop.stopId)) {
      if (period === 'morning_peak' || period === 'evening_peak') {
        offset += 0.035;
      } else if (period === 'midday') {
        offset += 0.025;
      } else if (period === 'early_morning') {
        offset += 0.015;
      }
    }

    return offset;
  }

  private getDirectionalProgressOccupancyOffset(
    route: RouteState,
    direction: DirectionId,
    period: TrafficPeriod,
    routeProgress: number,
  ) {
    if (period === 'morning_peak' && route.morningPeakFlow !== 'balanced') {
      return route.morningPeakFlow === direction
        ? routeProgress * 0.09
        : (1 - routeProgress) * 0.02 - 0.02;
    }

    if (period === 'evening_peak' && route.eveningPeakFlow !== 'balanced') {
      return route.eveningPeakFlow === direction
        ? (1 - routeProgress) * 0.1
        : routeProgress * 0.02 - 0.02;
    }

    if (period === 'midday') {
      const middayCenterLoad = 1 - Math.abs(routeProgress - 0.52) * 2;
      return Math.max(0, middayCenterLoad) *
        (route.serviceLevel === 'trunk' ? 0.04 : 0.025);
    }

    if (period === 'late_evening') {
      return Math.max(0, 1 - routeProgress) * 0.015;
    }

    return 0;
  }

  private blendOccupancyLoad(currentLoad: number, targetLoad: number, factor: number) {
    const safeFactor = Math.min(Math.max(factor, 0.05), 0.5);
    return Number(
      Math.min(
        0.98,
        Math.max(0.08, currentLoad + (targetLoad - currentLoad) * safeFactor),
      ).toFixed(3),
    );
  }

  private mapOccupancyLoadToLevel(load: number): OccupancyLevel {
    if (load < 0.34) {
      return 'low';
    }

    if (load < 0.58) {
      return 'medium';
    }

    if (load < 0.8) {
      return 'high';
    }

    return 'full';
  }

  private getNominalOccupancyLoad(occupancyLevel: OccupancyLevel) {
    switch (occupancyLevel) {
      case 'low':
        return 0.22;
      case 'medium':
        return 0.46;
      case 'high':
        return 0.7;
      case 'full':
      default:
        return 0.9;
    }
  }

  private calculateDwellTimeMs(
    stop: RouteStopState,
    occupancyLevel: OccupancyLevel,
    period: TrafficPeriod,
    occupancyLoad?: number,
  ) {
    const normalizedOccupancyLoad =
      occupancyLoad ?? this.getNominalOccupancyLoad(occupancyLevel);
    let dwellMs = 14_000;

    if (stop.isMajorStop) {
      dwellMs += 8_000;
    }

    if (stop.isInterchange) {
      dwellMs += 6_000;
    }

    if (occupancyLevel === 'high') {
      dwellMs += 5_000;
    }

    if (occupancyLevel === 'full') {
      dwellMs += 10_000;
    }

    dwellMs += Math.round(normalizedOccupancyLoad * 7_000);

    if (period === 'morning_peak' || period === 'evening_peak') {
      dwellMs += 5_000;
    }

    return dwellMs;
  }

  private calculateTerminalLayoverMs(
    stop: RouteStopState,
    period: TrafficPeriod,
  ) {
    let layoverMs = 50_000;

    if (stop.isMajorStop || stop.isInterchange) {
      layoverMs += 20_000;
    }

    if (period === 'late_evening' || period === 'night') {
      layoverMs += 15_000;
    }

    return layoverMs;
  }

  private calculateEtaForStop(
    bus: BusState,
    directionState: RouteDirectionState,
    targetDistanceMeters: number,
    now: number,
  ) {
    const distanceMeters = remainingDistance(
      bus.distanceAlongRouteMeters,
      targetDistanceMeters,
      directionState.totalDistanceMeters,
    );
    const holdMs = Math.max(
      (bus.dwellUntilMs ?? 0) - now,
      (bus.layoverUntilMs ?? 0) - now,
      0,
    );

    if (distanceMeters <= 20 && bus.status === 'at_stop') {
      return {
        minutes: 0,
        distanceMeters: 0,
      };
    }

    const effectiveSpeed = Math.max(
      bus.speedKmh || bus.baseSpeedKmh * bus.trafficMultiplier,
      8,
    );
    const intermediateStopDelayMinutes =
      this.estimateIntermediateStopDelayMinutes(
        directionState,
        bus.distanceAlongRouteMeters,
        targetDistanceMeters,
        bus,
        now,
      );
    const minutes = Math.max(
      bus.status === 'at_stop' ? 0 : 1,
      Math.ceil(holdMs / 60_000) +
        minutesFromDistance(distanceMeters, effectiveSpeed) +
        intermediateStopDelayMinutes,
    );

    return {
      minutes,
      distanceMeters,
    };
  }

  private estimateIntermediateStopDelayMinutes(
    directionState: RouteDirectionState,
    currentDistanceMeters: number,
    targetDistanceMeters: number,
    bus: BusState,
    now: number,
  ) {
    const period = getTrafficPeriod(now);
    const targetRemainingDistance = remainingDistance(
      currentDistanceMeters,
      targetDistanceMeters,
      directionState.totalDistanceMeters,
    );

    const dwellMs = directionState.stops.reduce((totalDelayMs, stop) => {
      const stopRemainingDistance = remainingDistance(
        currentDistanceMeters,
        stop.distanceFromStartMeters,
        directionState.totalDistanceMeters,
      );

      if (
        stopRemainingDistance <= 35 ||
        stopRemainingDistance >= targetRemainingDistance - 35
      ) {
        return totalDelayMs;
      }

      return (
        totalDelayMs +
        this.calculateDwellTimeMs(
          stop,
          bus.occupancyLevel,
          period,
          bus.occupancyLoad,
        ) * 0.65
      );
    }, 0);

    return Math.ceil(dwellMs / 60_000);
  }

  private buildRouteStatusSnapshot(
    route: RouteState,
    direction: DirectionId,
  ): RouteStatusSnapshot {
    const now = new Date().toISOString();
    const buses = Array.from(this.buses.values()).filter(
      (bus) => bus.routeId === route.routeId && bus.direction === direction,
    );
    const averageSpeedKmh = this.average(
      buses.map((bus) => bus.speedKmh),
      route.baseCruiseSpeedKmh,
    );
    const averageMultiplier = this.average(
      buses.map((bus) => bus.trafficMultiplier),
      0.85,
    );
    const activeDelayReasons = Array.from(this.delayEvents.values())
      .filter((delayEvent) => delayEvent.routeId === route.routeId)
      .filter((delayEvent) => delayEvent.direction === direction)
      .map((delayEvent) => delayEvent.reason);

    return {
      routeId: route.routeId,
      routeNumber: route.routeNumber,
      direction,
      trafficLevel: getTrafficLevel(averageMultiplier),
      averageSpeedKmh: Number(averageSpeedKmh.toFixed(1)),
      averageDelayMinutes: Math.max(
        activeDelayReasons.length * 2,
        Math.round((1 / averageMultiplier - 1) * 7),
      ),
      activeDelayReasons,
      updatedAt: now,
    };
  }

  private getRouteStatusByRoute(routeId: string) {
    const [outbound, inbound] = this.getRouteStatusSnapshots(routeId);

    return {
      outbound: this.toRouteStatusResponse(outbound),
      inbound: this.toRouteStatusResponse(inbound),
    };
  }

  private toDirectionResponse(directionState: RouteDirectionState) {
    return {
      origin: directionState.origin,
      destination: directionState.destination,
      direction_label: directionState.directionLabel,
      total_distance_meters: Math.round(directionState.totalDistanceMeters),
      stop_count: directionState.stops.length,
      polyline: directionState.polyline,
      stops: directionState.stops.map((stop) => ({
        stop_id: stop.stopId,
        stop_name: stop.stopName,
        latitude: stop.location.lat,
        longitude: stop.location.lng,
        sequence: stop.sequence,
        landmark: stop.landmark,
        area_description: stop.areaDescription,
        is_major_stop: stop.isMajorStop,
        is_interchange: stop.isInterchange,
      })),
    };
  }

  private toStopResponse(stop: StopState) {
    return {
      stop_id: stop.stopId,
      stop_name: stop.stopName,
      latitude: stop.location.lat,
      longitude: stop.location.lng,
      route_ids: stop.routeIds,
      landmark: stop.landmark,
      area_description: stop.areaDescription,
      is_major_stop: stop.isMajorStop,
      is_interchange: stop.isInterchange,
      route_assignments: stop.assignments
        .slice()
        .sort((left, right) => {
          if (left.routeNumber === right.routeNumber) {
            return left.sequence - right.sequence;
          }

          return left.routeNumber.localeCompare(right.routeNumber);
        })
        .map((assignment) => ({
          route_id: assignment.routeId,
          route_number: assignment.routeNumber,
          route_name: assignment.routeName,
          direction: assignment.direction,
          sequence: assignment.sequence,
        })),
    };
  }

  private toBusResponse(bus: BusState) {
    const route = this.mustGetRoute(bus.routeId);
    const directionState = route.directions[bus.direction];
    const nextStop = directionState.stops.find(
      (stop) => stop.stopId === bus.nextStopId,
    ) ?? directionState.stops[0];
    const currentSegmentFrom =
      directionState.polyline[bus.currentSegmentIndex] ?? bus.currentPosition;
    const currentSegmentTo =
      directionState.polyline[bus.currentSegmentIndex + 1] ?? bus.currentPosition;
    const etaToNextStop = this.getNextStopEtaForBus(bus.busId);

    return {
      bus_id: bus.busId,
      vehicle_number: bus.vehicleNumber,
      license_plate: bus.licensePlate,
      driver_name: bus.driverName,
      capacity: bus.capacity,
      route_id: bus.routeId,
      route_number: bus.routeNumber,
      direction: bus.direction,
      current_position: bus.currentPosition,
      current_segment: {
        index: bus.currentSegmentIndex,
        from: currentSegmentFrom,
        to: currentSegmentTo,
      },
      next_stop_id: nextStop.stopId,
      next_stop_name: nextStop.stopName,
      occupancy_level: bus.occupancyLevel,
      speed_kmh: bus.speedKmh,
      status: bus.status,
      traffic_level: getTrafficLevel(bus.trafficMultiplier),
      traffic_multiplier: Number(bus.trafficMultiplier.toFixed(2)),
      eta_to_next_stop_minutes: etaToNextStop.minutes,
      updated_at: bus.updatedAt,
    };
  }

  private toRouteStatusResponse(snapshot: RouteStatusSnapshot) {
    return {
      direction: snapshot.direction,
      traffic_level: snapshot.trafficLevel,
      average_speed_kmh: snapshot.averageSpeedKmh,
      average_delay_minutes: snapshot.averageDelayMinutes,
      active_delay_reasons: snapshot.activeDelayReasons,
      updated_at: snapshot.updatedAt,
    };
  }

  private refreshDelayEvents(now: number) {
    Array.from(this.delayEvents.values()).forEach((delayEvent) => {
      if (new Date(delayEvent.endsAt).getTime() <= now) {
        this.delayEvents.delete(delayEvent.eventId);
      }
    });
  }

  private maybeCreateDelayEvent(now: number) {
    if (this.delayEvents.size >= 3 || Math.random() > 0.08) {
      return;
    }

    const routes = Array.from(this.routes.values());
    const route = routes[Math.floor(Math.random() * routes.length)];
    const direction: DirectionId = Math.random() > 0.5 ? 'outbound' : 'inbound';

    const alreadyActive = Array.from(this.delayEvents.values()).some(
      (delayEvent) =>
        delayEvent.routeId === route.routeId && delayEvent.direction === direction,
    );

    if (alreadyActive) {
      return;
    }

    const directionState = route.directions[direction];
    const hotspotStops = directionState.stops.filter((stop) => stop.isMajorStop);
    const hotspot =
      hotspotStops[Math.floor(Math.random() * hotspotStops.length)] ??
      directionState.stops[0];
    const eventId = `${route.routeId}_${direction}_${now}`;
    const durationMinutes = 3 + Math.floor(Math.random() * 6);
    const reasons = [
      `Heavy traffic near ${hotspot.stopName}`,
      `Long boarding queue at ${hotspot.stopName}`,
      `Rain slowdown around ${hotspot.stopName}`,
      `Traffic signal delays approaching ${hotspot.stopName}`,
    ];
    const reason = reasons[Math.floor(Math.random() * reasons.length)];

    this.delayEvents.set(eventId, {
      eventId,
      routeId: route.routeId,
      direction,
      reason,
      multiplier: 0.55 + Math.random() * 0.2,
      startedAt: new Date(now).toISOString(),
      endsAt: new Date(now + durationMinutes * 60_000).toISOString(),
    });
  }

  private findActiveDelay(routeId: string, direction: DirectionId, now: number) {
    return Array.from(this.delayEvents.values()).find(
      (delayEvent) =>
        delayEvent.routeId === routeId &&
        delayEvent.direction === direction &&
        new Date(delayEvent.startedAt).getTime() <= now &&
        new Date(delayEvent.endsAt).getTime() > now,
    );
  }

  private findUpcomingStop(
    directionState: RouteDirectionState,
    currentDistanceMeters: number,
  ) {
    return (
      directionState.stops.find(
        (stop) => stop.distanceFromStartMeters > currentDistanceMeters + 1,
      ) ?? directionState.stops[directionState.stops.length - 1]
    );
  }

  private mustGetRoute(routeId: string) {
    const route = this.routes.get(routeId);

    if (!route) {
      throw new NotFoundException(`Route ${routeId} not found`);
    }

    return route;
  }

  private mustGetStop(stopId: string) {
    const stop = this.stops.get(stopId);

    if (!stop) {
      throw new NotFoundException(`Stop ${stopId} not found`);
    }

    return stop;
  }

  private mustGetBus(busId: string) {
    const bus = this.buses.get(busId);

    if (!bus) {
      throw new NotFoundException(`Bus ${busId} not found`);
    }

    return bus;
  }

  private average(values: number[], fallback: number) {
    if (values.length === 0) {
      return fallback;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private hashBusId(busId: string) {
    const hash = busId
      .split('')
      .reduce((sum, character) => sum + character.charCodeAt(0), 0);
    return ((hash % 7) - 3) / 12;
  }

  private getCapacityForRoute(routeNumber: string) {
    return ROUTE_CAPACITY_BY_NUMBER[routeNumber] ?? 72;
  }

  private buildDriverName(busId: string) {
    const hash = this.hashBusSeed(busId);
    const firstName = DRIVER_FIRST_NAMES[hash % DRIVER_FIRST_NAMES.length];
    const lastName = DRIVER_LAST_NAMES[(hash * 3) % DRIVER_LAST_NAMES.length];
    return `${firstName} ${lastName}`;
  }

  private buildLicensePlate(
    routeNumber: string,
    direction: DirectionId,
    vehicleIndex: number,
  ) {
    const routeSeed = Number(routeNumber) || this.hashBusSeed(routeNumber);
    const directionOffset = direction === 'outbound' ? 17 : 53;
    const number =
      1000 + ((routeSeed * 137 + directionOffset + vehicleIndex * 89) % 9000);
    const provinceCode = String(
      10 + ((routeSeed + vehicleIndex * 3) % 80),
    ).padStart(2, '0');
    return `${provinceCode}-${String(number).padStart(4, '0')}`;
  }

  private buildDriverProfile(
    busId: string,
    driverName: string,
    routeNumber: string,
  ) {
    const hash = this.hashBusSeed(busId);
    const normalizedBusId = busId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const employeeCode = `EMP-${normalizedBusId}`;
    const licenseNumber = `DRV-${normalizedBusId}`;
    const phoneSuffix = String(1000 + (hash % 9000)).padStart(4, '0');
    const emergencySuffix = String(1000 + ((hash * 7) % 9000)).padStart(4, '0');
    const expiryYear = 2027 + (hash % 4);
    const expiryMonth = String((hash % 12) + 1).padStart(2, '0');
    const expiryDay = String(((hash * 3) % 28) + 1).padStart(2, '0');
    const contactFirstName =
      DRIVER_FIRST_NAMES[(hash * 5) % DRIVER_FIRST_NAMES.length];
    const contactLastName =
      DRIVER_LAST_NAMES[(hash * 11) % DRIVER_LAST_NAMES.length];

    return {
      driverId: `driver_${busId}`,
      employeeCode,
      fullName: driverName,
      phoneNumber: `08${phoneSuffix}5678`,
      licenseNumber,
      licenseExpiryDate: `${expiryYear}-${expiryMonth}-${expiryDay}T00:00:00.000Z`,
      emergencyContactName: `${contactFirstName} ${contactLastName}`,
      emergencyContactPhone: `09${emergencySuffix}4321`,
      depotName: this.getDepotNameForRoute(routeNumber),
      status: 'ACTIVE' as const,
    };
  }

  private getDepotNameForRoute(routeNumber: string) {
    if (['29', '34', '59', '510'].includes(routeNumber)) {
      return 'Northern Depot';
    }

    if (['8', '511'].includes(routeNumber)) {
      return 'Central West Depot';
    }

    if (['26', '145'].includes(routeNumber)) {
      return 'Eastern Depot';
    }

    return 'Bangkok Main Depot';
  }

  private getBusServiceStatus(status: BusStatus) {
    if (status === 'out_of_service') {
      return 'OUT_OF_SERVICE' as const;
    }

    return 'IN_SERVICE' as const;
  }

  private hashBusSeed(value: string) {
    return value
      .split('')
      .reduce(
        (sum, character, index) => sum + character.charCodeAt(0) * (index + 1),
        0,
      );
  }
}
