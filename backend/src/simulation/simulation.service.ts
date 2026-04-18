import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { TransitStateService } from '../transit/transit-state.service';
import { SimulationGateway } from './simulation.gateway';

const MIN_TICK_MS = 2_000;
const MAX_TICK_MS = 5_000;

@Injectable()
export class SimulationService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SimulationService.name);
  private timeoutId?: NodeJS.Timeout;
  private lastTickAt = Date.now();

  constructor(
    private readonly transitState: TransitStateService,
    private readonly simulationGateway: SimulationGateway,
  ) {}

  onApplicationBootstrap() {
    this.lastTickAt = Date.now();
    this.logger.log(
      'Starting BusBuddy realtime simulation with Bangkok mock routes.',
    );
    this.emitCurrentState();
    this.scheduleNextTick();
  }

  onApplicationShutdown() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }

  private scheduleNextTick() {
    const delay = this.randomDelay();
    this.timeoutId = setTimeout(() => {
      void this.runTick();
    }, delay);
  }

  private async runTick() {
    try {
      const now = Date.now();
      const elapsedMs = Math.max(MIN_TICK_MS, now - this.lastTickAt);
      this.lastTickAt = now;

      this.transitState.advanceSimulation(elapsedMs);
      this.emitCurrentState();
    } catch (error) {
      this.logger.error(
        `Simulation tick failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.scheduleNextTick();
    }
  }

  private emitCurrentState() {
    this.transitState.getAllBusIds().forEach((busId) => {
      const busPayload = this.transitState.getRealtimeBusPayload(busId);
      const etaPayload = this.transitState.getRealtimeEtaPayload(busId);

      this.simulationGateway.emitBusLocationUpdate(busPayload);
      this.simulationGateway.emitEtaUpdate(etaPayload);
    });

    this.transitState.getRealtimeRouteStatusPayloads().forEach((payload) => {
      this.simulationGateway.emitRouteStatusUpdate(payload);
    });
  }

  private randomDelay() {
    return (
      Math.floor(Math.random() * (MAX_TICK_MS - MIN_TICK_MS + 1)) + MIN_TICK_MS
    );
  }
}
