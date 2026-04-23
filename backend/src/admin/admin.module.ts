import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { FleetModule } from '../fleet/fleet.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SimulationModule } from '../simulation/simulation.module';
import { TransitModule } from '../transit/transit.module';
import { AdminAuditService } from './admin-audit.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AiModule, FleetModule, PrismaModule, SimulationModule, TransitModule],
  controllers: [AdminController],
  providers: [AdminAuditService, AdminService],
  exports: [AdminAuditService],
})
export class AdminModule {}
