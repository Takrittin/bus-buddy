import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { TransitModule } from '../transit/transit.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

@Module({
  imports: [TransitModule, BillingModule],
  controllers: [InsightsController],
  providers: [InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}
