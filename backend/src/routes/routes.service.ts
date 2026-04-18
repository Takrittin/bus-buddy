import { Injectable } from '@nestjs/common';
import { TransitStateService } from '../transit/transit-state.service';

@Injectable()
export class RoutesService {
  constructor(private readonly transitState: TransitStateService) {}

  findAll() {
    return this.transitState.getRoutes();
  }

  findOne(routeId: string) {
    return this.transitState.getRoute(routeId);
  }
}
