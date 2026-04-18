import { Module } from '@nestjs/common';
import { TransitModule } from '../transit/transit.module';
import { EtaController } from './eta.controller';
import { EtaService } from './eta.service';

@Module({
  imports: [TransitModule],
  controllers: [EtaController],
  providers: [EtaService],
  exports: [EtaService],
})
export class EtaModule {}
