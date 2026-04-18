import { Module } from '@nestjs/common';
import { TransitModule } from '../transit/transit.module';
import { SimulationGateway } from './simulation.gateway';
import { SimulationService } from './simulation.service';

@Module({
  imports: [TransitModule],
  providers: [SimulationGateway, SimulationService],
  exports: [SimulationGateway],
})
export class SimulationModule {}
