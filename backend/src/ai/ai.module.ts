import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { FleetModule } from '../fleet/fleet.module';
import { InsightsModule } from '../insights/insights.module';
import { SimulationModule } from '../simulation/simulation.module';
import { TransitModule } from '../transit/transit.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [BillingModule, TransitModule, FleetModule, SimulationModule, InsightsModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
