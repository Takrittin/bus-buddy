import { Module } from '@nestjs/common';
import { TransitModule } from '../transit/transit.module';
import { BusesController } from './buses.controller';
import { BusesService } from './buses.service';
import { RouteVehiclesController } from './route-vehicles.controller';

@Module({
  imports: [TransitModule],
  controllers: [BusesController, RouteVehiclesController],
  providers: [BusesService],
})
export class BusesModule {}
