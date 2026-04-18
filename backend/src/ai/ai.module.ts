import { Module } from '@nestjs/common';
import { TransitModule } from '../transit/transit.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [TransitModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
