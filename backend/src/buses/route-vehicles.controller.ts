import { Controller, Get, Param } from '@nestjs/common';
import { BusesService } from './buses.service';

@Controller('route-vehicles')
export class RouteVehiclesController {
  constructor(private readonly busesService: BusesService) {}

  @Get(':routeId')
  findRouteVehicles(@Param('routeId') routeId: string) {
    return this.busesService.findRouteVehicles(routeId);
  }
}
