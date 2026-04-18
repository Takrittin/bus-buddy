import { Injectable } from '@nestjs/common';
import { TransitStateService } from '../transit/transit-state.service';

@Injectable()
export class BusesService {
  constructor(private readonly transitState: TransitStateService) {}

  findLive(routeId?: string) {
    return this.transitState.getLiveBuses(routeId);
  }

  findRouteVehicles(routeId: string) {
    return this.transitState.getRouteVehicles(routeId);
  }
}
