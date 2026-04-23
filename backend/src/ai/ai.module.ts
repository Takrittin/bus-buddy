import { Module } from '@nestjs/common';
import { FleetModule } from '../fleet/fleet.module';
import { SimulationModule } from '../simulation/simulation.module';
import { TransitModule } from '../transit/transit.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [TransitModule, FleetModule, SimulationModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
