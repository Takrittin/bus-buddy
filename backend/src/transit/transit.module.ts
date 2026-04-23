import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TransitStateService } from './transit-state.service';
import { TransitPersistenceService } from './transit-persistence.service';

@Module({
  imports: [PrismaModule],
  providers: [TransitStateService, TransitPersistenceService],
  exports: [TransitStateService, TransitPersistenceService],
})
export class TransitModule {}
