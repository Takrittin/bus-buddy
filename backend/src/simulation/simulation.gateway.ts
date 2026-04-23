import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class SimulationGateway {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(SimulationGateway.name);

  isReady() {
    return Boolean(this.server);
  }

  emitBusLocationUpdate(payload: object) {
    if (!this.server) {
      this.logger.warn('Socket server is not ready for bus updates yet.');
      return;
    }

    this.server.emit('bus_location_update', payload);
  }

  emitEtaUpdate(payload: object) {
    if (!this.server) {
      this.logger.warn('Socket server is not ready for ETA updates yet.');
      return;
    }

    this.server.emit('eta_update', payload);
  }

  emitRouteStatusUpdate(payload: object) {
    if (!this.server) {
      this.logger.warn('Socket server is not ready for route status updates yet.');
      return;
    }

    this.server.emit('route_status_update', payload);
  }
}
