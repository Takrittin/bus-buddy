import { Module } from '@nestjs/common';
import { TransitModule } from '../transit/transit.module';
import { NearbyStopsController } from './nearby-stops.controller';
import { StopsController } from './stops.controller';
import { StopsService } from './stops.service';

@Module({
  imports: [TransitModule],
  controllers: [StopsController, NearbyStopsController],
  providers: [StopsService],
})
export class StopsModule {}
