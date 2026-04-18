import { Injectable } from '@nestjs/common';
import { NearbyStopsDto } from './dto/nearby-stops.dto';
import { TransitStateService } from '../transit/transit-state.service';

@Injectable()
export class StopsService {
  constructor(private readonly transitState: TransitStateService) {}

  async findNearby(query: NearbyStopsDto) {
    const { lat, lng, radius } = query;
    return this.transitState.getNearbyStops(lat, lng, radius);
  }

  async findAll() {
    return this.transitState.getStops();
  }

  async getStopDetails(id: string) {
    return this.transitState.getStop(id);
  }
}
