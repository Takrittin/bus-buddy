import { Controller, Get, Query } from '@nestjs/common';
import { InsightsService } from './insights.service';

@Controller('insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get('trip-planner')
  getTripPlan(
    @Query('originLat') originLat: string,
    @Query('originLng') originLng: string,
    @Query('destinationLat') destinationLat: string,
    @Query('destinationLng') destinationLng: string,
  ) {
    return this.insightsService.planTrip({
      originLat: Number(originLat),
      originLng: Number(originLng),
      destinationLat: Number(destinationLat),
      destinationLng: Number(destinationLng),
    });
  }

  @Get('stop-crowding')
  getStopCrowding(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string,
  ) {
    return this.insightsService.getStopCrowding({
      lat: lat ? Number(lat) : undefined,
      lng: lng ? Number(lng) : undefined,
      radius: radius ? Number(radius) : undefined,
    });
  }

  @Get('service-alerts')
  getServiceAlerts() {
    return this.insightsService.getServiceAlerts();
  }

  @Get('fleet-dispatch')
  getFleetDispatchBoard() {
    return this.insightsService.getFleetDispatchBoard();
  }

  @Get('analytics')
  getAnalyticsDashboard() {
    return this.insightsService.getAnalyticsDashboard();
  }
}
