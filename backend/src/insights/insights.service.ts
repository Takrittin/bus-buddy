import { Injectable } from '@nestjs/common';
import { TransitStateService } from '../transit/transit-state.service';
import { DirectionId, OccupancyLevel, TrafficLevel } from '../transit/transit.types';
import { distanceInMeters, minutesFromDistance, remainingDistance } from '../transit/geo.utils';

type LocationInput = { lat: number; lng: number };

type TripPlannerInput = {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
};

type StopCrowdingInput = {
  lat?: number;
  lng?: number;
  radius?: number;
};

type StopLike = ReturnType<TransitStateService['getStops']>[number] & {
  distance_meters?: number;
};

type BusLike = ReturnType<TransitStateService['getLiveBuses']>[number];

type RouteLike = ReturnType<TransitStateService['getRoutes']>[number];

const WALKING_SPEED_METERS_PER_MINUTE = 75;
const TRANSFER_BUFFER_MINUTES = 4;
const MAX_TRANSFER_WALK_METERS = 450;
const DEFAULT_DWELL_MINUTES_PER_STOP = 0.6;
const BUS_TRIP_TIME_BUFFER = 1.18;

@Injectable()
export class InsightsService {
  constructor(private readonly transitState: TransitStateService) {}

  planTrip(input: TripPlannerInput) {
    const origin = { lat: input.originLat, lng: input.originLng };
    const destination = { lat: input.destinationLat, lng: input.destinationLng };
    const originStops = this.transitState.getNearbyStops(origin.lat, origin.lng, 1800).slice(0, 8);
    const destinationStops = this.transitState
      .getNearbyStops(destination.lat, destination.lng, 1800)
      .slice(0, 8);
    const routes = this.transitState.getRoutes();
    const allStops = this.transitState.getStops();

    const directPlans = originStops.flatMap((boardingStop) =>
      destinationStops.flatMap((alightingStop) =>
        this.buildDirectPlans(boardingStop, alightingStop, routes),
      ),
    );
    const transferPlans = originStops.flatMap((boardingStop) =>
      destinationStops.flatMap((alightingStop) =>
        this.buildTransferPlans(boardingStop, alightingStop, allStops, routes),
      ),
    );

    return {
      origin,
      destination,
      generated_at: new Date().toISOString(),
      plans: this.dedupePlans([...directPlans, ...transferPlans])
        .sort((left, right) => left.total_minutes - right.total_minutes)
        .slice(0, 8),
      fallback_stops: {
        origin: originStops.slice(0, 3).map((stop) => this.toCompactStop(stop)),
        destination: destinationStops.slice(0, 3).map((stop) => this.toCompactStop(stop)),
      },
    };
  }

  getStopCrowding(input: StopCrowdingInput) {
    const stops =
      typeof input.lat === 'number' && typeof input.lng === 'number'
        ? this.transitState.getNearbyStops(input.lat, input.lng, input.radius ?? 1800)
        : this.transitState.getStops();
    const liveBuses = this.transitState.getLiveBuses();
    const etaByStop = new Map(
      stops.slice(0, 30).map((stop) => [stop.stop_id, this.transitState.getEtaPredictions(stop.stop_id)]),
    );

    return stops
      .slice(0, 30)
      .map((stop) => {
        const etaPredictions = etaByStop.get(stop.stop_id) ?? [];
        const approachingBuses = liveBuses.filter((bus) => bus.next_stop_id === stop.stop_id);
        const fullApproaching = approachingBuses.filter(
          (bus) => bus.occupancy_level === 'full' || bus.occupancy_level === 'high',
        ).length;
        const highEtaCount = etaPredictions.filter(
          (eta) => eta.occupancy_level === 'full' || eta.occupancy_level === 'high',
        ).length;
        const baseScore =
          (stop.is_interchange ? 30 : 0) +
          (stop.is_major_stop ? 20 : 0) +
          Math.min((stop.route_ids?.length ?? 0) * 4, 24) +
          fullApproaching * 15 +
          highEtaCount * 10;
        const score = Math.min(100, Math.round(baseScore));

        return {
          stop_id: stop.stop_id,
          stop_name: stop.stop_name,
          distance_meters: 'distance_meters' in stop ? stop.distance_meters : undefined,
          route_ids: stop.route_ids?.slice(0, 8) ?? [],
          crowding_level: this.toCrowdingLevel(score),
          crowding_score: score,
          full_or_high_buses: fullApproaching + highEtaCount,
          next_arrivals: etaPredictions.slice(0, 3).map((eta) => ({
            route_number: eta.route_number,
            minutes: eta.minutes,
            occupancy_level: eta.occupancy_level,
          })),
          reason: this.buildCrowdingReason(stop, fullApproaching + highEtaCount),
        };
      })
      .sort((left, right) => {
        if (typeof left.distance_meters === 'number' && typeof right.distance_meters === 'number') {
          return left.distance_meters - right.distance_meters;
        }

        return right.crowding_score - left.crowding_score;
      })
      .slice(0, 10);
  }

  getServiceAlerts() {
    const routeStatuses = this.transitState.getRealtimeRouteStatusPayloads();
    const liveBuses = this.transitState.getLiveBuses();

    return routeStatuses
      .flatMap((status) => {
        const routeBuses = liveBuses.filter(
          (bus) => bus.route_id === status.route_id && bus.direction === status.direction,
        );
        const delayedBuses = routeBuses.filter((bus) => bus.status === 'delayed');
        const fullBuses = routeBuses.filter((bus) => bus.occupancy_level === 'full');
        const alerts = [];

        if (status.traffic_level === 'severe' || status.average_delay_minutes >= 8) {
          alerts.push({
            id: `${status.route_id}-${status.direction}-delay`,
            type: 'route_delay',
            severity: status.traffic_level === 'severe' ? 'critical' : 'warning',
            route_id: status.route_id,
            route_number: status.route_number,
            direction: status.direction,
            title: `Route ${status.route_number} delay`,
            description: `${status.direction} service is averaging ${status.average_delay_minutes} min delay with ${status.traffic_level} traffic.`,
            affected_buses: delayedBuses.length,
            updated_at: status.updated_at,
          });
        }

        if (routeBuses.length <= 2) {
          alerts.push({
            id: `${status.route_id}-${status.direction}-gap`,
            type: 'headway_gap',
            severity: 'warning',
            route_id: status.route_id,
            route_number: status.route_number,
            direction: status.direction,
            title: `Route ${status.route_number} coverage gap`,
            description: `${status.direction} service has only ${routeBuses.length} live buses in the feed.`,
            affected_buses: routeBuses.length,
            updated_at: status.updated_at,
          });
        }

        if (fullBuses.length >= 2) {
          alerts.push({
            id: `${status.route_id}-${status.direction}-full`,
            type: 'crowding',
            severity: 'info',
            route_id: status.route_id,
            route_number: status.route_number,
            direction: status.direction,
            title: `Route ${status.route_number} crowded buses`,
            description: `${fullBuses.length} buses are reporting full occupancy.`,
            affected_buses: fullBuses.length,
            updated_at: status.updated_at,
          });
        }

        return alerts;
      })
      .sort((left, right) => this.alertSeverityWeight(right.severity) - this.alertSeverityWeight(left.severity))
      .slice(0, 20);
  }

  getFleetDispatchBoard() {
    const routes = this.transitState.getRoutes();
    const statuses = this.transitState.getRealtimeRouteStatusPayloads();
    const liveBuses = this.transitState.getLiveBuses();

    return statuses
      .map((status) => {
        const route = routes.find((candidate) => candidate.route_id === status.route_id);
        const routeBuses = liveBuses.filter(
          (bus) => bus.route_id === status.route_id && bus.direction === status.direction,
        );
        const availableCandidate = this.pickDispatchCandidate(liveBuses, status.route_id, status.direction);
        const headwayRisk = Math.max(
          0,
          Math.round((route?.average_headway_minutes ?? 12) - routeBuses.length * 2),
        );
        const priorityScore =
          status.average_delay_minutes * 7 +
          (status.traffic_level === 'severe' ? 35 : status.traffic_level === 'heavy' ? 18 : 0) +
          headwayRisk * 4 +
          routeBuses.filter((bus) => bus.occupancy_level === 'full').length * 8;

        return {
          route_id: status.route_id,
          route_number: status.route_number,
          route_name: route?.route_name ?? `Route ${status.route_number}`,
          direction: status.direction,
          priority_score: Math.round(priorityScore),
          average_delay_minutes: status.average_delay_minutes,
          traffic_level: status.traffic_level,
          live_buses: routeBuses.length,
          headway_risk_minutes: headwayRisk,
          suggested_action:
            priorityScore >= 70
              ? 'Dispatch support bus now'
              : priorityScore >= 40
                ? 'Hold terminal bus and monitor gap'
                : 'Monitor only',
          suggested_bus: availableCandidate
            ? {
                bus_id: availableCandidate.bus_id,
                vehicle_number: availableCandidate.vehicle_number,
                license_plate: availableCandidate.license_plate,
                current_route_number: availableCandidate.route_number,
                occupancy_level: availableCandidate.occupancy_level,
              }
            : null,
        };
      })
      .sort((left, right) => right.priority_score - left.priority_score)
      .slice(0, 8);
  }

  getAnalyticsDashboard() {
    const liveBuses = this.transitState.getLiveBuses();
    const routes = this.transitState.getRoutes();
    const statuses = this.transitState.getRealtimeRouteStatusPayloads();
    const crowding = this.getStopCrowding({});
    const activeBuses = liveBuses.filter((bus) => bus.status !== 'out_of_service');
    const averageSpeed =
      activeBuses.length === 0
        ? 0
        : Math.round(activeBuses.reduce((total, bus) => total + Number(bus.speed_kmh ?? 0), 0) / activeBuses.length);
    const onTimeBuses = activeBuses.filter((bus) => bus.status !== 'delayed').length;

    return {
      generated_at: new Date().toISOString(),
      summary: {
        active_buses: activeBuses.length,
        on_time_rate:
          activeBuses.length === 0 ? 100 : Math.round((onTimeBuses / activeBuses.length) * 100),
        average_speed_kmh: averageSpeed,
        severe_traffic_routes: statuses.filter((status) => status.traffic_level === 'severe').length,
        full_buses: activeBuses.filter((bus) => bus.occupancy_level === 'full').length,
      },
      busiest_stops: crowding.slice(0, 5),
      route_reliability: routes
        .map((route) => {
          const routeStatuses = statuses.filter((status) => status.route_id === route.route_id);
          const averageDelay =
            routeStatuses.length === 0
              ? 0
              : routeStatuses.reduce((total, status) => total + status.average_delay_minutes, 0) /
                routeStatuses.length;
          const severeCount = routeStatuses.filter((status) => status.traffic_level === 'severe').length;

          return {
            route_id: route.route_id,
            route_number: route.route_number,
            route_name: route.route_name,
            reliability_score: Math.max(35, Math.round(100 - averageDelay * 5 - severeCount * 10)),
            average_delay_minutes: Math.round(averageDelay),
            average_speed_kmh:
              routeStatuses.length === 0
                ? 0
                : Math.round(
                    routeStatuses.reduce((total, status) => total + status.average_speed_kmh, 0) /
                      routeStatuses.length,
                  ),
          };
        })
        .sort((left, right) => left.reliability_score - right.reliability_score)
        .slice(0, 8),
    };
  }

  private buildDirectPlans(boardingStop: StopLike, alightingStop: StopLike, routes: RouteLike[]) {
    const plans = [];

    for (const boardingAssignment of boardingStop.route_assignments ?? []) {
      const alightingAssignment = (alightingStop.route_assignments ?? []).find(
        (assignment) =>
          assignment.route_id === boardingAssignment.route_id &&
          assignment.direction === boardingAssignment.direction &&
          assignment.sequence > boardingAssignment.sequence,
      );

      if (!alightingAssignment) {
        continue;
      }

      const route = routes.find((candidate) => candidate.route_id === boardingAssignment.route_id);
      const eta = this.findEta(boardingStop, boardingAssignment);
      const walkToStopMinutes = Math.ceil((boardingStop.distance_meters ?? 0) / WALKING_SPEED_METERS_PER_MINUTE);
      const walkFromStopMinutes = Math.ceil((alightingStop.distance_meters ?? 0) / WALKING_SPEED_METERS_PER_MINUTE);
      const rideMinutes = this.estimateRideMinutes(route, boardingAssignment, alightingAssignment);
      const waitMinutes = eta?.minutes ?? route?.average_headway_minutes ?? 12;
      const firstLeg = this.buildTripLeg(
        boardingAssignment,
        boardingStop,
        alightingStop,
        waitMinutes,
        rideMinutes,
        eta,
      );

      plans.push({
        plan_id: `${boardingStop.stop_id}-${alightingStop.stop_id}-${boardingAssignment.route_id}-${boardingAssignment.direction}`,
        journey_type: 'direct',
        route_id: boardingAssignment.route_id,
        route_number: boardingAssignment.route_number,
        route_name: boardingAssignment.route_name,
        direction: boardingAssignment.direction,
        boarding_stop: this.toCompactStop(boardingStop),
        alighting_stop: this.toCompactStop(alightingStop),
        walk_to_stop_minutes: walkToStopMinutes,
        wait_minutes: waitMinutes,
        ride_minutes: rideMinutes,
        transfer_wait_minutes: 0,
        walk_from_stop_minutes: walkFromStopMinutes,
        total_minutes: walkToStopMinutes + waitMinutes + rideMinutes + walkFromStopMinutes,
        legs: [firstLeg],
        next_bus: eta
          ? {
              bus_id: eta.bus_id,
              license_plate: eta.license_plate,
              minutes: eta.minutes,
              occupancy_level: eta.occupancy_level,
              traffic_level: eta.traffic_level,
            }
          : null,
      });
    }

    return plans;
  }

  private buildTransferPlans(
    boardingStop: StopLike,
    alightingStop: StopLike,
    allStops: StopLike[],
    routes: RouteLike[],
  ) {
    const plans = [];

    for (const boardingAssignment of boardingStop.route_assignments ?? []) {
      const firstRoute = routes.find((candidate) => candidate.route_id === boardingAssignment.route_id);

      for (const alightingAssignment of alightingStop.route_assignments ?? []) {
        if (boardingAssignment.route_id === alightingAssignment.route_id) {
          continue;
        }

        const secondRoute = routes.find((candidate) => candidate.route_id === alightingAssignment.route_id);
        const firstTransferCandidates = allStops
          .filter(
            (stop) =>
              stop.stop_id !== boardingStop.stop_id &&
              stop.stop_id !== alightingStop.stop_id &&
              stop.route_ids?.includes(boardingAssignment.route_id),
          )
          .sort((left, right) => {
            const leftPriority = (left.is_interchange ? 2 : 0) + (left.is_major_stop ? 1 : 0);
            const rightPriority = (right.is_interchange ? 2 : 0) + (right.is_major_stop ? 1 : 0);

            return rightPriority - leftPriority;
          })
          .slice(0, 40);

        const secondTransferCandidates = allStops
          .filter(
            (stop) =>
              stop.stop_id !== boardingStop.stop_id &&
              stop.stop_id !== alightingStop.stop_id &&
              stop.route_ids?.includes(alightingAssignment.route_id),
          )
          .slice(0, 80);

        for (const transferStop of firstTransferCandidates) {
          const firstTransferAssignment = (transferStop.route_assignments ?? []).find(
            (assignment) =>
              assignment.route_id === boardingAssignment.route_id &&
              assignment.direction === boardingAssignment.direction &&
              assignment.sequence > boardingAssignment.sequence,
          );

          if (!firstTransferAssignment) {
            continue;
          }

          const nearbySecondTransferStops = secondTransferCandidates
            .map((candidate) => ({
              stop: candidate,
              walkMeters: Math.round(
                distanceInMeters(
                  { lat: transferStop.latitude, lng: transferStop.longitude },
                  { lat: candidate.latitude, lng: candidate.longitude },
                ),
              ),
            }))
            .filter((candidate) => candidate.walkMeters <= MAX_TRANSFER_WALK_METERS)
            .sort((left, right) => left.walkMeters - right.walkMeters)
            .slice(0, 5);

          for (const secondTransfer of nearbySecondTransferStops) {
            const secondTransferAssignment = (secondTransfer.stop.route_assignments ?? []).find(
              (assignment) =>
                assignment.route_id === alightingAssignment.route_id &&
                assignment.direction === alightingAssignment.direction &&
                assignment.sequence < alightingAssignment.sequence,
            );

            if (!secondTransferAssignment) {
              continue;
            }

            const firstEta = this.findEta(boardingStop, boardingAssignment);
            const secondEta = this.findEta(secondTransfer.stop, secondTransferAssignment);
            const walkToStopMinutes = Math.ceil((boardingStop.distance_meters ?? 0) / WALKING_SPEED_METERS_PER_MINUTE);
            const walkFromStopMinutes = Math.ceil((alightingStop.distance_meters ?? 0) / WALKING_SPEED_METERS_PER_MINUTE);
            const transferWalkMinutes = Math.ceil(secondTransfer.walkMeters / WALKING_SPEED_METERS_PER_MINUTE);
            const firstRideMinutes = this.estimateRideMinutes(firstRoute, boardingAssignment, firstTransferAssignment);
            const secondRideMinutes = this.estimateRideMinutes(secondRoute, secondTransferAssignment, alightingAssignment);
            const firstWaitMinutes = firstEta?.minutes ?? firstRoute?.average_headway_minutes ?? 12;
            const secondWaitMinutes = secondEta?.minutes ?? secondRoute?.average_headway_minutes ?? 12;
            const transferWaitMinutes = secondWaitMinutes + transferWalkMinutes + TRANSFER_BUFFER_MINUTES;
            const totalMinutes =
              walkToStopMinutes +
              firstWaitMinutes +
              firstRideMinutes +
              transferWaitMinutes +
              secondRideMinutes +
              walkFromStopMinutes;

            plans.push({
              plan_id: `${boardingStop.stop_id}-${transferStop.stop_id}-${secondTransfer.stop.stop_id}-${alightingStop.stop_id}-${boardingAssignment.route_id}-${alightingAssignment.route_id}-${boardingAssignment.direction}-${alightingAssignment.direction}`,
              journey_type: 'transfer',
              route_id: `${boardingAssignment.route_id}+${alightingAssignment.route_id}`,
              route_number: `${boardingAssignment.route_number} + ${alightingAssignment.route_number}`,
              route_name: `${boardingAssignment.route_name} → ${alightingAssignment.route_name}`,
              direction: boardingAssignment.direction,
              boarding_stop: this.toCompactStop(boardingStop),
              alighting_stop: this.toCompactStop(alightingStop),
              transfer_stop: this.toCompactStop(secondTransfer.walkMeters <= 80 ? transferStop : secondTransfer.stop),
              walk_to_stop_minutes: walkToStopMinutes,
              wait_minutes: firstWaitMinutes,
              ride_minutes: firstRideMinutes + secondRideMinutes,
              transfer_wait_minutes: transferWaitMinutes,
              walk_from_stop_minutes: walkFromStopMinutes,
              total_minutes: totalMinutes,
              legs: [
                this.buildTripLeg(
                  boardingAssignment,
                  boardingStop,
                  transferStop,
                  firstWaitMinutes,
                  firstRideMinutes,
                  firstEta,
                ),
                this.buildTripLeg(
                  secondTransferAssignment,
                  secondTransfer.stop,
                  alightingStop,
                  transferWaitMinutes,
                  secondRideMinutes,
                  secondEta,
                ),
              ],
              next_bus: firstEta
                ? {
                    bus_id: firstEta.bus_id,
                    license_plate: firstEta.license_plate,
                    minutes: firstEta.minutes,
                    occupancy_level: firstEta.occupancy_level,
                    traffic_level: firstEta.traffic_level,
                  }
                : null,
            });
          }
        }
      }
    }

    return plans;
  }

  private buildTripLeg(
    assignment: NonNullable<StopLike['route_assignments']>[number],
    boardingStop: StopLike,
    alightingStop: StopLike,
    waitMinutes: number,
    rideMinutes: number,
    eta?: ReturnType<TransitStateService['getEtaPredictions']>[number],
  ) {
    return {
      route_id: assignment.route_id,
      route_number: assignment.route_number,
      route_name: assignment.route_name,
      direction: assignment.direction,
      boarding_stop: this.toCompactStop(boardingStop),
      alighting_stop: this.toCompactStop(alightingStop),
      wait_minutes: waitMinutes,
      ride_minutes: rideMinutes,
      next_bus: eta
        ? {
            bus_id: eta.bus_id,
            license_plate: eta.license_plate,
            minutes: eta.minutes,
            occupancy_level: eta.occupancy_level,
            traffic_level: eta.traffic_level,
          }
        : null,
    };
  }

  private estimateRideMinutes(
    route: RouteLike | undefined,
    boardingAssignment: NonNullable<StopLike['route_assignments']>[number],
    alightingAssignment: NonNullable<StopLike['route_assignments']>[number],
  ) {
    if (!route) {
      return Math.max(8, (alightingAssignment.sequence - boardingAssignment.sequence) * 5);
    }

    const direction = route.directions[boardingAssignment.direction];
    const status = route.current_status?.[boardingAssignment.direction];
    const boardingStop = direction?.stops?.find((stop) => stop.sequence === boardingAssignment.sequence);
    const alightingStop = direction?.stops?.find((stop) => stop.sequence === alightingAssignment.sequence);
    const stopGap = Math.max(1, alightingAssignment.sequence - boardingAssignment.sequence);

    if (!direction || !boardingStop || !alightingStop) {
      return Math.max(8, Math.ceil(stopGap * 5.5));
    }

    const distanceMeters = remainingDistance(
      boardingStop.distance_from_start_meters ?? 0,
      alightingStop.distance_from_start_meters ?? 0,
      direction.total_distance_meters ?? 0,
    );
    const averageSpeedKmh = Math.max(14, Number(status?.average_speed_kmh ?? 24));
    const trafficDelayMinutes = Number(status?.average_delay_minutes ?? 0) * Math.min(1.2, stopGap / 10);
    const dwellMinutes = stopGap * DEFAULT_DWELL_MINUTES_PER_STOP;

    return Math.max(
      Math.ceil(stopGap * 3.8),
      Math.ceil(minutesFromDistance(distanceMeters, averageSpeedKmh) * BUS_TRIP_TIME_BUFFER + dwellMinutes + trafficDelayMinutes),
    );
  }

  private findEta(
    stop: StopLike,
    assignment: NonNullable<StopLike['route_assignments']>[number],
  ) {
    return this.transitState
      .getEtaPredictions(stop.stop_id)
      .find(
        (prediction) =>
          prediction.route_id === assignment.route_id &&
          prediction.direction === assignment.direction,
      );
  }

  private dedupePlans<T extends { plan_id: string; total_minutes: number }>(plans: T[]) {
    const planById = new Map<string, T>();

    for (const plan of plans) {
      const currentPlan = planById.get(plan.plan_id);

      if (!currentPlan || plan.total_minutes < currentPlan.total_minutes) {
        planById.set(plan.plan_id, plan);
      }
    }

    return Array.from(planById.values());
  }

  private pickDispatchCandidate(buses: BusLike[], routeId: string, direction: DirectionId) {
    return buses
      .filter(
        (bus) =>
          bus.route_id !== routeId &&
          bus.direction === direction &&
          bus.status !== 'out_of_service' &&
          (bus.occupancy_level === 'low' || bus.occupancy_level === 'medium'),
      )
      .sort((left, right) => Number(left.eta_to_next_stop_minutes ?? 99) - Number(right.eta_to_next_stop_minutes ?? 99))[0];
  }

  private toCompactStop(stop: StopLike) {
    return {
      stop_id: stop.stop_id,
      stop_name: stop.stop_name,
      distance_meters: stop.distance_meters,
      latitude: stop.latitude,
      longitude: stop.longitude,
      route_ids: stop.route_ids?.slice(0, 8) ?? [],
      landmark: stop.landmark,
    };
  }

  private toCrowdingLevel(score: number) {
    if (score >= 78) {
      return 'very_crowded';
    }

    if (score >= 56) {
      return 'crowded';
    }

    if (score >= 34) {
      return 'moderate';
    }

    return 'comfortable';
  }

  private buildCrowdingReason(stop: StopLike, fullOrHighBuses: number) {
    if (fullOrHighBuses > 0) {
      return `${fullOrHighBuses} high/full buses approaching`;
    }

    if (stop.is_interchange) {
      return 'Major interchange demand';
    }

    if (stop.is_major_stop) {
      return 'Major stop demand';
    }

    return 'Normal stop demand';
  }

  private alertSeverityWeight(severity: string) {
    switch (severity) {
      case 'critical':
        return 3;
      case 'warning':
        return 2;
      default:
        return 1;
    }
  }
}
