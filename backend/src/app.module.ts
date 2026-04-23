import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { BusesModule } from './buses/buses.module';
import { EtaModule } from './eta/eta.module';
import { FleetModule } from './fleet/fleet.module';
import { RoutesModule } from './routes/routes.module';
import { SimulationModule } from './simulation/simulation.module';
import { StopsModule } from './stops/stops.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AdminModule,
    AiModule,
    AuthModule,
    BusesModule,
    EtaModule,
    FleetModule,
    RoutesModule,
    SimulationModule,
    StopsModule,
    UsersModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
