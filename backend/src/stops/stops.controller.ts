import { Controller, Get, Param, Query } from '@nestjs/common';
import { StopsService } from './stops.service';
import { NearbyStopsDto } from './dto/nearby-stops.dto';

@Controller('stops')
export class StopsController {
  constructor(private readonly stopsService: StopsService) {}

  @Get()
  findAll() {
    return this.stopsService.findAll();
  }

  @Get('nearby')
  findNearby(@Query() query: NearbyStopsDto) {
    return this.stopsService.findNearby(query);
  }

  @Get(':id')
  getStopDetails(@Param('id') id: string) {
    return this.stopsService.getStopDetails(id);
  }
}
