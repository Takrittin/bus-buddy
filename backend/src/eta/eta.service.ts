import { Injectable } from '@nestjs/common';
import { TransitStateService } from '../transit/transit-state.service';

@Injectable()
export class EtaService {
  constructor(private readonly transitState: TransitStateService) {}

  getEtaForStop(stopId: string) {
    return this.transitState.getEtaPredictions(stopId);
  }
}
