import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  BusServiceStatus,
  DriverStatus,
  RouteDirection,
  ShiftStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransitStateService } from './transit-state.service';
import { BANGKOK_ROUTE_SEEDS, BANGKOK_STOPS } from './bangkok-transit.data';

@Injectable()
export class TransitPersistenceService implements OnModuleInit {
  private readonly logger = new Logger(TransitPersistenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transitState: TransitStateService,
  ) {}

  async onModuleInit() {
    await this.syncTransitReferenceData();
  }

  private async syncTransitReferenceData() {
    const isDatabaseReachable = await this.prisma.isDatabaseReachable();

    if (!isDatabaseReachable) {
      this.logger.warn(
        'Skipping stop and route sync because Postgres is currently unavailable.',
      );
      return;
    }

    const routeIds = BANGKOK_ROUTE_SEEDS.map((route) => route.routeId);
    const busMasterRecords = this.transitState.getBusMasterRecords();
    const driverIds = busMasterRecords.map((record) => record.driver.driverId);
    const busIds = busMasterRecords.map((record) => record.busId);
    const shiftRecords = this.buildShiftRecords(busMasterRecords);
    const shiftIds = shiftRecords.map((shift) => shift.id);

    try {
      for (const stop of BANGKOK_STOPS) {
        await this.prisma.busStop.upsert({
          where: { id: stop.stopId },
          create: {
            id: stop.stopId,
            code: stop.stopId,
            name: stop.stopName,
            latitude: stop.location.lat,
            longitude: stop.location.lng,
            landmark: stop.landmark,
            areaDescription: stop.areaDescription,
            isMajorStop: stop.isMajorStop,
            isInterchange: stop.isInterchange,
            zone: stop.zone,
          },
          update: {
            code: stop.stopId,
            name: stop.stopName,
            latitude: stop.location.lat,
            longitude: stop.location.lng,
            landmark: stop.landmark,
            areaDescription: stop.areaDescription,
            isMajorStop: stop.isMajorStop,
            isInterchange: stop.isInterchange,
            zone: stop.zone,
          },
        });
      }

      for (const route of BANGKOK_ROUTE_SEEDS) {
        await this.prisma.route.upsert({
          where: { id: route.routeId },
          create: {
            id: route.routeId,
            shortName: route.routeNumber,
            longName: route.routeName,
            color: route.color,
            origin: route.origin,
            destination: route.destination,
            outboundDirection: route.outboundDirection,
            inboundDirection: route.inboundDirection,
            firstBusTime: route.firstBusTime,
            lastBusTime: route.lastBusTime,
            averageHeadwayMinutes: route.averageHeadwayMinutes,
          },
          update: {
            shortName: route.routeNumber,
            longName: route.routeName,
            color: route.color,
            origin: route.origin,
            destination: route.destination,
            outboundDirection: route.outboundDirection,
            inboundDirection: route.inboundDirection,
            firstBusTime: route.firstBusTime,
            lastBusTime: route.lastBusTime,
            averageHeadwayMinutes: route.averageHeadwayMinutes,
          },
        });
      }

      await this.prisma.stopRoute.deleteMany({
        where: {
          routeId: {
            in: routeIds,
          },
        },
      });

      const stopRoutes = BANGKOK_ROUTE_SEEDS.flatMap((route) =>
        (['outbound', 'inbound'] as const).flatMap((directionKey) =>
          route.directions[directionKey].stopIds.map((stopId, index) => ({
            stopId,
            routeId: route.routeId,
            direction:
              directionKey === 'outbound'
                ? RouteDirection.OUTBOUND
                : RouteDirection.INBOUND,
            sequence: index + 1,
          })),
        ),
      );

      if (stopRoutes.length > 0) {
        await this.prisma.stopRoute.createMany({
          data: stopRoutes,
        });
      }

      await this.prisma.driver.deleteMany({
        where: {
          id: {
            notIn: driverIds.length > 0 ? driverIds : ['__none__'],
          },
        },
      });

      for (const record of busMasterRecords) {
        await this.prisma.driver.upsert({
          where: { id: record.driver.driverId },
          create: {
            id: record.driver.driverId,
            employeeCode: record.driver.employeeCode,
            fullName: record.driver.fullName,
            phoneNumber: record.driver.phoneNumber,
            licenseNumber: record.driver.licenseNumber,
            licenseExpiryDate: new Date(record.driver.licenseExpiryDate),
            emergencyContactName: record.driver.emergencyContactName,
            emergencyContactPhone: record.driver.emergencyContactPhone,
            depotName: record.driver.depotName,
            status: record.driver.status as DriverStatus,
          },
          update: {
            employeeCode: record.driver.employeeCode,
            fullName: record.driver.fullName,
            phoneNumber: record.driver.phoneNumber,
            licenseNumber: record.driver.licenseNumber,
            licenseExpiryDate: new Date(record.driver.licenseExpiryDate),
            emergencyContactName: record.driver.emergencyContactName,
            emergencyContactPhone: record.driver.emergencyContactPhone,
            depotName: record.driver.depotName,
            status: record.driver.status as DriverStatus,
          },
        });
      }

      await this.prisma.bus.deleteMany({
        where: {
          id: {
            notIn: busIds.length > 0 ? busIds : ['__none__'],
          },
        },
      });

      for (const record of busMasterRecords) {
        await this.prisma.bus.upsert({
          where: { id: record.busId },
          create: {
            id: record.busId,
            vehicleNumber: record.vehicleNumber,
            licensePlate: record.licensePlate,
            capacity: record.capacity,
            routeId: record.routeId,
            driverId: record.driver.driverId,
            depotName: record.depotName,
            serviceStatus: record.serviceStatus as BusServiceStatus,
          },
          update: {
            vehicleNumber: record.vehicleNumber,
            licensePlate: record.licensePlate,
            capacity: record.capacity,
            routeId: record.routeId,
            driverId: record.driver.driverId,
            depotName: record.depotName,
            serviceStatus: record.serviceStatus as BusServiceStatus,
          },
        });
      }

      await this.prisma.driverShift.deleteMany({
        where: {
          id: {
            notIn: shiftIds.length > 0 ? shiftIds : ['__none__'],
          },
        },
      });

      for (const shift of shiftRecords) {
        await this.prisma.driverShift.upsert({
          where: { id: shift.id },
          create: {
            id: shift.id,
            driverId: shift.driverId,
            busId: shift.busId,
            routeId: shift.routeId,
            direction: shift.direction,
            shiftStartAt: shift.shiftStartAt,
            shiftEndAt: shift.shiftEndAt,
            checkInAt: shift.checkInAt,
            checkOutAt: shift.checkOutAt,
            status: shift.status,
            notes: shift.notes,
          },
          update: {
            driverId: shift.driverId,
            busId: shift.busId,
            routeId: shift.routeId,
            direction: shift.direction,
            shiftStartAt: shift.shiftStartAt,
            shiftEndAt: shift.shiftEndAt,
            checkInAt: shift.checkInAt,
            checkOutAt: shift.checkOutAt,
            status: shift.status,
            notes: shift.notes,
          },
        });
      }

      this.logger.log(
        `Synced ${BANGKOK_STOPS.length} stops, ${BANGKOK_ROUTE_SEEDS.length} routes, ${driverIds.length} drivers, ${busIds.length} bus master records, and ${shiftIds.length} driver shifts.`,
      );
    } catch (error) {
      if (this.prisma.isConnectionError(error)) {
        this.logger.warn(
          'Postgres became unavailable while syncing stops and routes. The app will keep using in-memory transit data until the database returns.',
        );
        return;
      }

      throw error;
    }
  }

  private buildShiftRecords(
    busMasterRecords: Array<{
      busId: string;
      routeId: string;
      routeNumber: string;
      direction: 'outbound' | 'inbound';
      driver: {
        driverId: string;
      };
    }>,
  ) {
    const now = new Date();
    const today = this.atStartOfDay(now);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    return busMasterRecords.flatMap((record, index) => {
      const startHour = 4 + (index % 5);
      const activeShiftStart = this.atTime(today, startHour, index % 2 === 0 ? 0 : 30);
      const activeShiftEnd = new Date(activeShiftStart);
      activeShiftEnd.setHours(activeShiftEnd.getHours() + 9);

      const completedShiftStart = this.atTime(
        yesterday,
        startHour,
        index % 2 === 0 ? 0 : 30,
      );
      const completedShiftEnd = new Date(completedShiftStart);
      completedShiftEnd.setHours(completedShiftEnd.getHours() + 9);

      const direction =
        record.direction === 'outbound'
          ? RouteDirection.OUTBOUND
          : RouteDirection.INBOUND;

      return [
        {
          id: `shift_active_${record.busId}`,
          driverId: record.driver.driverId,
          busId: record.busId,
          routeId: record.routeId,
          direction,
          shiftStartAt: activeShiftStart,
          shiftEndAt: activeShiftEnd,
          checkInAt: new Date(activeShiftStart.getTime() - 15 * 60 * 1000),
          checkOutAt: null,
          status: ShiftStatus.ACTIVE,
          notes: `Assigned to route ${record.routeNumber} ${record.direction} service.`,
        },
        {
          id: `shift_history_${record.busId}`,
          driverId: record.driver.driverId,
          busId: record.busId,
          routeId: record.routeId,
          direction,
          shiftStartAt: completedShiftStart,
          shiftEndAt: completedShiftEnd,
          checkInAt: new Date(completedShiftStart.getTime() - 20 * 60 * 1000),
          checkOutAt: new Date(completedShiftEnd.getTime() + 10 * 60 * 1000),
          status: ShiftStatus.COMPLETED,
          notes: `Completed previous duty on route ${record.routeNumber}.`,
        },
      ];
    });
  }

  private atStartOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private atTime(date: Date, hour: number, minute: number) {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      hour,
      minute,
      0,
      0,
    );
  }
}
