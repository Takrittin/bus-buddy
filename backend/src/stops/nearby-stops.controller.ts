import { Controller, Get, Query } from '@nestjs/common';
import { StopsService } from './stops.service';
import { NearbyStopsDto } from './dto/nearby-stops.dto';

@Controller('nearby-stops')
export class NearbyStopsController {
  constructor(private readonly stopsService: StopsService) {}

  @Get()
  findNearby(@Query() query: NearbyStopsDto) {
    return this.stopsService.findNearby(query);
  }
}
