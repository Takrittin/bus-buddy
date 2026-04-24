import { Injectable } from '@nestjs/common';
import { TransitStateService } from '../transit/transit-state.service';
import { DirectionId, OccupancyLevel, TrafficLevel } from '../transit/transit.types';

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

    const plans = originStops.flatMap((boardingStop) =>
      destinationStops.flatMap((alightingStop) =>
        this.buildDirectPlans(boardingStop, alightingStop, routes),
      ),
    );

    return {
      origin,
      destination,
      generated_at: new Date().toISOString(),
      plans: plans
        .sort((left, right) => left.total_minutes - right.total_minutes)
        .slice(0, 5),
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
      const eta = this.transitState
        .getEtaPredictions(boardingStop.stop_id)
        .find(
          (prediction) =>
            prediction.route_id === boardingAssignment.route_id &&
            prediction.direction === boardingAssignment.direction,
        );
      const walkToStopMinutes = Math.ceil((boardingStop.distance_meters ?? 0) / WALKING_SPEED_METERS_PER_MINUTE);
      const walkFromStopMinutes = Math.ceil((alightingStop.distance_meters ?? 0) / WALKING_SPEED_METERS_PER_MINUTE);
      const rideMinutes = Math.max(4, (alightingAssignment.sequence - boardingAssignment.sequence) * 3);
      const waitMinutes = eta?.minutes ?? route?.average_headway_minutes ?? 12;

      plans.push({
        plan_id: `${boardingStop.stop_id}-${alightingStop.stop_id}-${boardingAssignment.route_id}-${boardingAssignment.direction}`,
        route_id: boardingAssignment.route_id,
        route_number: boardingAssignment.route_number,
        route_name: boardingAssignment.route_name,
        direction: boardingAssignment.direction,
        boarding_stop: this.toCompactStop(boardingStop),
        alighting_stop: this.toCompactStop(alightingStop),
        walk_to_stop_minutes: walkToStopMinutes,
        wait_minutes: waitMinutes,
        ride_minutes: rideMinutes,
        walk_from_stop_minutes: walkFromStopMinutes,
        total_minutes: walkToStopMinutes + waitMinutes + rideMinutes + walkFromStopMinutes,
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
