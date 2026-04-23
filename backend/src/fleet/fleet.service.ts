import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BusServiceStatus, Prisma, RouteDirection, ShiftStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDriverShiftDto } from './dto/create-driver-shift.dto';
import { UpdateDriverShiftDto } from './dto/update-driver-shift.dto';
import { CloseDriverShiftDto } from './dto/close-driver-shift.dto';

@Injectable()
export class FleetService {
  constructor(private readonly prisma: PrismaService) {}

  async getBuses() {
    const buses = await this.prisma.bus.findMany({
      include: {
        route: true,
        driver: true,
      },
      orderBy: [{ routeId: 'asc' }, { vehicleNumber: 'asc' }],
    });

    return buses.map((bus) => this.toBusResponse(bus));
  }

  async getBus(busId: string) {
    const bus = await this.prisma.bus.findUnique({
      where: { id: busId },
      include: {
        route: true,
        driver: true,
        shifts: {
          orderBy: { shiftStartAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!bus) {
      throw new NotFoundException(`Bus ${busId} not found.`);
    }

    return {
      ...this.toBusResponse(bus),
      shifts: bus.shifts.map((shift) => this.toShiftResponse(shift)),
    };
  }

  async getDrivers() {
    const drivers = await this.prisma.driver.findMany({
      include: {
        buses: {
          include: {
            route: true,
          },
          orderBy: { vehicleNumber: 'asc' },
        },
        shifts: {
          orderBy: { shiftStartAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { fullName: 'asc' },
    });

    return drivers.map((driver) => ({
      id: driver.id,
      employee_code: driver.employeeCode,
      full_name: driver.fullName,
      phone_number: driver.phoneNumber,
      license_number: driver.licenseNumber,
      license_expiry_date: driver.licenseExpiryDate?.toISOString() ?? null,
      emergency_contact_name: driver.emergencyContactName,
      emergency_contact_phone: driver.emergencyContactPhone,
      depot_name: driver.depotName,
      status: driver.status,
      assigned_buses: driver.buses.map((bus) => this.toBusResponse(bus)),
      recent_shifts: driver.shifts.map((shift) => this.toShiftResponse(shift)),
    }));
  }

  async getDriver(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        buses: {
          include: {
            route: true,
          },
          orderBy: { vehicleNumber: 'asc' },
        },
        shifts: {
          include: {
            bus: true,
            route: true,
          },
          orderBy: { shiftStartAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!driver) {
      throw new NotFoundException(`Driver ${driverId} not found.`);
    }

    return {
      id: driver.id,
      employee_code: driver.employeeCode,
      full_name: driver.fullName,
      phone_number: driver.phoneNumber,
      license_number: driver.licenseNumber,
      license_expiry_date: driver.licenseExpiryDate?.toISOString() ?? null,
      emergency_contact_name: driver.emergencyContactName,
      emergency_contact_phone: driver.emergencyContactPhone,
      depot_name: driver.depotName,
      status: driver.status,
      assigned_buses: driver.buses.map((bus) => this.toBusResponse(bus)),
      shifts: driver.shifts.map((shift) =>
        this.toShiftResponse(shift, {
          bus_vehicle_number: shift.bus.vehicleNumber,
          bus_license_plate: shift.bus.licensePlate,
          route_number: shift.route.shortName,
        }),
      ),
    };
  }

  async getDriverShifts() {
    const shifts = await this.prisma.driverShift.findMany({
      include: {
        driver: true,
        bus: true,
        route: true,
      },
      orderBy: [{ shiftStartAt: 'desc' }, { id: 'asc' }],
    });

    return shifts.map((shift) =>
      this.toShiftResponse(shift, {
        driver_name: shift.driver.fullName,
        bus_vehicle_number: shift.bus.vehicleNumber,
        bus_license_plate: shift.bus.licensePlate,
        route_number: shift.route.shortName,
      }),
    );
  }

  async getCurrentDriverShifts() {
    const shifts = await this.prisma.driverShift.findMany({
      where: { status: 'ACTIVE' },
      include: {
        driver: true,
        bus: true,
        route: true,
      },
      orderBy: [{ shiftStartAt: 'asc' }, { id: 'asc' }],
    });

    return shifts.map((shift) =>
      this.toShiftResponse(shift, {
        driver_name: shift.driver.fullName,
        bus_vehicle_number: shift.bus.vehicleNumber,
        bus_license_plate: shift.bus.licensePlate,
        route_number: shift.route.shortName,
      }),
    );
  }

  async createDriverShift(createDriverShiftDto: CreateDriverShiftDto) {
    const payload = this.normalizeShiftInput(createDriverShiftDto);
    await this.ensureShiftReferences(payload);
    await this.ensureShiftHasValidRange(payload.shiftStartAt, payload.shiftEndAt);
    const requiredPayload = this.toRequiredShiftPayload(payload);
    await this.ensureNoShiftOverlap({
      driverId: requiredPayload.driverId,
      busId: requiredPayload.busId,
      shiftStartAt: requiredPayload.shiftStartAt,
      shiftEndAt: requiredPayload.shiftEndAt,
    });

    const shift = await this.prisma.driverShift.create({
      data: {
        driverId: requiredPayload.driverId,
        busId: requiredPayload.busId,
        routeId: requiredPayload.routeId,
        direction: requiredPayload.direction,
        shiftStartAt: requiredPayload.shiftStartAt,
        shiftEndAt: requiredPayload.shiftEndAt,
        checkInAt: requiredPayload.checkInAt,
        status: requiredPayload.status ?? ShiftStatus.SCHEDULED,
        notes: requiredPayload.notes,
      },
    });

    await this.syncBusAssignment(shift.busId);
    return this.getDriverShiftResponse(shift.id);
  }

  async updateDriverShift(shiftId: string, updateDriverShiftDto: UpdateDriverShiftDto) {
    const existingShift = await this.prisma.driverShift.findUnique({
      where: { id: shiftId },
    });

    if (!existingShift) {
      throw new NotFoundException(`Shift ${shiftId} not found.`);
    }

    const payload = this.normalizeShiftInput(updateDriverShiftDto);
    const nextShift = {
      driverId: payload.driverId ?? existingShift.driverId,
      busId: payload.busId ?? existingShift.busId,
      routeId: payload.routeId ?? existingShift.routeId,
      direction: payload.direction ?? existingShift.direction,
      shiftStartAt: payload.shiftStartAt ?? existingShift.shiftStartAt,
      shiftEndAt: payload.shiftEndAt ?? existingShift.shiftEndAt,
      checkInAt:
        payload.checkInAt === undefined ? existingShift.checkInAt : payload.checkInAt,
      status: payload.status ?? existingShift.status,
      notes: payload.notes === undefined ? existingShift.notes : payload.notes,
    };

    await this.ensureShiftReferences(nextShift);
    await this.ensureShiftHasValidRange(nextShift.shiftStartAt, nextShift.shiftEndAt);
    await this.ensureNoShiftOverlap({
      driverId: nextShift.driverId,
      busId: nextShift.busId,
      shiftStartAt: nextShift.shiftStartAt,
      shiftEndAt: nextShift.shiftEndAt,
      excludeShiftId: shiftId,
    });

    const shift = await this.prisma.driverShift.update({
      where: { id: shiftId },
      data: nextShift,
    });

    await this.syncBusAssignment(existingShift.busId);
    if (existingShift.busId !== shift.busId) {
      await this.syncBusAssignment(shift.busId);
    }

    return this.getDriverShiftResponse(shift.id);
  }

  async closeDriverShift(shiftId: string, closeDriverShiftDto: CloseDriverShiftDto) {
    const existingShift = await this.prisma.driverShift.findUnique({
      where: { id: shiftId },
      include: {
        driver: true,
        bus: true,
        route: true,
      },
    });

    if (!existingShift) {
      throw new NotFoundException(`Shift ${shiftId} not found.`);
    }

    const status = closeDriverShiftDto.status ?? ShiftStatus.COMPLETED;

    const shift = await this.prisma.driverShift.update({
      where: { id: shiftId },
      data: {
        checkOutAt: closeDriverShiftDto.checkOutAt
          ? new Date(closeDriverShiftDto.checkOutAt)
          : new Date(),
        status,
        notes:
          closeDriverShiftDto.notes ??
          existingShift.notes ??
          `Shift closed with status ${status}.`,
      },
    });

    await this.syncBusAssignment(shift.busId);
    return this.getDriverShiftResponse(shift.id);
  }

  private toBusResponse(bus: any) {
    return {
      id: bus.id,
      vehicle_number: bus.vehicleNumber,
      license_plate: bus.licensePlate,
      capacity: bus.capacity,
      route_id: bus.routeId,
      route_number: bus.route?.shortName ?? null,
      driver_id: bus.driverId,
      driver_name: bus.driver?.fullName ?? null,
      depot_name: bus.depotName,
      service_status: bus.serviceStatus,
      created_at: bus.createdAt.toISOString(),
      updated_at: bus.updatedAt.toISOString(),
    };
  }

  private toShiftResponse(shift: any, extra: Record<string, string | null> = {}) {
    return {
      id: shift.id,
      driver_id: shift.driverId,
      bus_id: shift.busId,
      route_id: shift.routeId,
      direction: shift.direction,
      shift_start_at: shift.shiftStartAt.toISOString(),
      shift_end_at: shift.shiftEndAt.toISOString(),
      check_in_at: shift.checkInAt?.toISOString() ?? null,
      check_out_at: shift.checkOutAt?.toISOString() ?? null,
      status: shift.status,
      notes: shift.notes ?? null,
      ...extra,
    };
  }

  private normalizeShiftInput(
    dto: Partial<CreateDriverShiftDto> | Partial<UpdateDriverShiftDto>,
  ) {
    return {
      driverId: dto.driverId,
      busId: dto.busId,
      routeId: dto.routeId,
      direction: dto.direction,
      shiftStartAt: dto.shiftStartAt ? new Date(dto.shiftStartAt) : undefined,
      shiftEndAt: dto.shiftEndAt ? new Date(dto.shiftEndAt) : undefined,
      checkInAt:
        dto.checkInAt === undefined
          ? undefined
          : dto.checkInAt
            ? new Date(dto.checkInAt)
            : null,
      status: dto.status,
      notes: dto.notes?.trim() ? dto.notes.trim() : dto.notes,
    };
  }

  private async ensureShiftReferences(input: {
    driverId?: string;
    busId?: string;
    routeId?: string;
  }) {
    const [driver, bus, route] = await Promise.all([
      input.driverId
        ? this.prisma.driver.findUnique({ where: { id: input.driverId } })
        : Promise.resolve(null),
      input.busId ? this.prisma.bus.findUnique({ where: { id: input.busId } }) : Promise.resolve(null),
      input.routeId
        ? this.prisma.route.findUnique({ where: { id: input.routeId } })
        : Promise.resolve(null),
    ]);

    if (input.driverId && !driver) {
      throw new NotFoundException(`Driver ${input.driverId} not found.`);
    }

    if (input.busId && !bus) {
      throw new NotFoundException(`Bus ${input.busId} not found.`);
    }

    if (input.routeId && !route) {
      throw new NotFoundException(`Route ${input.routeId} not found.`);
    }
  }

  private async ensureShiftHasValidRange(shiftStartAt?: Date, shiftEndAt?: Date) {
    if (!shiftStartAt || !shiftEndAt) {
      throw new BadRequestException('Shift start and end time are required.');
    }

    if (Number.isNaN(shiftStartAt.getTime()) || Number.isNaN(shiftEndAt.getTime())) {
      throw new BadRequestException('Shift start and end time must be valid ISO dates.');
    }

    if (shiftEndAt <= shiftStartAt) {
      throw new BadRequestException('Shift end time must be after shift start time.');
    }
  }

  private toRequiredShiftPayload(input: {
    driverId?: string;
    busId?: string;
    routeId?: string;
    direction?: RouteDirection;
    shiftStartAt?: Date;
    shiftEndAt?: Date;
    checkInAt?: Date | null;
    status?: ShiftStatus;
    notes?: string | null;
  }) {
    return {
      driverId: input.driverId as string,
      busId: input.busId as string,
      routeId: input.routeId as string,
      direction: input.direction as RouteDirection,
      shiftStartAt: input.shiftStartAt as Date,
      shiftEndAt: input.shiftEndAt as Date,
      checkInAt: input.checkInAt,
      status: input.status,
      notes: input.notes,
    };
  }

  private async ensureNoShiftOverlap(input: {
    driverId: string;
    busId: string;
    shiftStartAt: Date;
    shiftEndAt: Date;
    excludeShiftId?: string;
  }) {
    const overlapWhere = {
      status: {
        in: [ShiftStatus.SCHEDULED, ShiftStatus.ACTIVE],
      },
      shiftStartAt: {
        lt: input.shiftEndAt,
      },
      shiftEndAt: {
        gt: input.shiftStartAt,
      },
      ...(input.excludeShiftId
        ? {
            id: {
              not: input.excludeShiftId,
            },
          }
        : {}),
    } satisfies Prisma.DriverShiftWhereInput;

    const [driverConflict, busConflict] = await Promise.all([
      this.prisma.driverShift.findFirst({
        where: {
          ...overlapWhere,
          driverId: input.driverId,
        },
      }),
      this.prisma.driverShift.findFirst({
        where: {
          ...overlapWhere,
          busId: input.busId,
        },
      }),
    ]);

    if (driverConflict) {
      throw new ConflictException(
        `Driver ${input.driverId} already has an overlapping shift.`,
      );
    }

    if (busConflict) {
      throw new ConflictException(`Bus ${input.busId} already has an overlapping shift.`);
    }
  }

  private async syncBusAssignment(busId: string) {
    const activeShift = await this.prisma.driverShift.findFirst({
      where: {
        busId,
        status: {
          in: [ShiftStatus.ACTIVE, ShiftStatus.SCHEDULED],
        },
      },
      orderBy: [{ status: 'asc' }, { shiftStartAt: 'asc' }],
    });

    if (!activeShift) {
      await this.prisma.bus.update({
        where: { id: busId },
        data: {
          driverId: null,
          serviceStatus: BusServiceStatus.AVAILABLE,
        },
      });
      return;
    }

    await this.prisma.bus.update({
      where: { id: busId },
      data: {
        driverId: activeShift.driverId,
        routeId: activeShift.routeId,
        serviceStatus:
          activeShift.status === ShiftStatus.ACTIVE
            ? BusServiceStatus.IN_SERVICE
            : BusServiceStatus.AVAILABLE,
      },
    });
  }

  private async getDriverShiftResponse(shiftId: string) {
    const shift = await this.prisma.driverShift.findUnique({
      where: { id: shiftId },
      include: {
        driver: true,
        bus: true,
        route: true,
      },
    });

    if (!shift) {
      throw new NotFoundException(`Shift ${shiftId} not found.`);
    }

    return this.toShiftResponse(shift, {
      driver_name: shift.driver.fullName,
      bus_vehicle_number: shift.bus.vehicleNumber,
      bus_license_plate: shift.bus.licensePlate,
      route_number: shift.route.shortName,
    });
  }
}
