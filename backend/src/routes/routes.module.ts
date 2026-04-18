import { Module } from '@nestjs/common';
import { TransitModule } from '../transit/transit.module';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';

@Module({
  imports: [TransitModule],
  controllers: [RoutesController],
  providers: [RoutesService],
})
export class RoutesModule {}
