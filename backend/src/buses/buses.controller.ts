import { Controller, Get, Param, Query } from '@nestjs/common';
import { BusesService } from './buses.service';

@Controller('buses')
export class BusesController {
  constructor(private readonly busesService: BusesService) {}

  @Get('live')
  getLiveBuses(@Query('routeId') routeId?: string) {
    return this.busesService.findLive(routeId);
  }

  @Get('live/:routeId')
  async getLiveBusesOnRoute(@Param('routeId') routeId: string) {
    return this.busesService.findLive(routeId);
  }
}
