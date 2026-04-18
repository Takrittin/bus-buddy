import { Controller, Get, Param } from '@nestjs/common';
import { RoutesService } from './routes.service';

@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Get()
  findAll() {
    return this.routesService.findAll();
  }

  @Get(':routeId')
  findOne(@Param('routeId') routeId: string) {
    return this.routesService.findOne(routeId);
  }
}
