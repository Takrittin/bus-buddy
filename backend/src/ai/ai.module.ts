import { Module } from '@nestjs/common';
import { FleetModule } from '../fleet/fleet.module';
import { TransitModule } from '../transit/transit.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [TransitModule, FleetModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
