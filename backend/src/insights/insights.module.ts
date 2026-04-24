import { Module } from '@nestjs/common';
import { TransitModule } from '../transit/transit.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

@Module({
  imports: [TransitModule],
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
