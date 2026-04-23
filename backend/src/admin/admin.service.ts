import {
  ConflictException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { requireAdminActor } from '../common/request-actor';
import { FleetService } from '../fleet/fleet.service';
import { PrismaService } from '../prisma/prisma.service';
import { SimulationGateway } from '../simulation/simulation.gateway';
import { TransitPersistenceService } from '../transit/transit-persistence.service';
import { hashPassword } from '../users/password.util';
import { AdminAuditService } from './admin-audit.service';
import { CreateFleetAccountDto } from './dto/create-fleet-account.dto';
import { DeleteUserDto } from './dto/delete-user.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fleetService: FleetService,
    private readonly transitPersistence: TransitPersistenceService,
    private readonly simulationGateway: SimulationGateway,
    private readonly aiService: AiService,
    private readonly auditService: AdminAuditService,
  ) {}

  async getUsers(actorUserId?: string | null, actorSessionVersion?: string | null) {
    await requireAdminActor(this.prisma, actorUserId, actorSessionVersion);

    const users = await this.prisma.user.findMany({
      include: {
        favoriteStops: {
          select: { id: true },
        },
        subscriptions: {
          where: { isActive: true },
          select: { id: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { email: 'asc' }],
    });

    return users.map((user) => this.toAdminUserResponse(user));
  }

  async updateUser(
    userId: string,
    dto: UpdateAdminUserDto,
    actorUserId?: string | null,
    actorSessionVersion?: string | null,
  ) {
    const actor = await requireAdminActor(this.prisma, actorUserId, actorSessionVersion);
    const existingUser = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!existingUser) {
      throw new NotFoundException('User not found.');
    }

    if (existingUser.deletedAt) {
      throw new BadRequestException('Restore deleted users before editing them.');
    }

    if (
      actor.id === userId &&
      ((dto.role && dto.role !== UserRole.ADMIN) || dto.isActive === false)
    ) {
      throw new BadRequestException('You cannot demote or disable your own admin account.');
    }

    const shouldRevokeSessions =
      dto.role !== undefined ||
      dto.isActive === false ||
      dto.mustResetPassword === true;

    if (dto.email && dto.email !== existingUser.email) {
      const emailTaken = await this.prisma.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });

      if (emailTaken) {
        throw new ConflictException('An account with this email already exists.');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: dto.email,
        name: dto.name,
        role: dto.role as UserRole | undefined,
        operatorName:
          dto.operatorName === undefined
            ? undefined
            : dto.operatorName.trim()
              ? dto.operatorName.trim()
              : null,
        depotName:
          dto.depotName === undefined
            ? undefined
            : dto.depotName.trim()
              ? dto.depotName.trim()
              : null,
        isActive: dto.isActive,
        mustResetPassword: dto.mustResetPassword,
        deletedAt: dto.isActive === true ? null : undefined,
        sessionVersion: shouldRevokeSessions ? { increment: 1 } : undefined,
      },
      include: {
        favoriteStops: {
          select: { id: true },
        },
        subscriptions: {
          where: { isActive: true },
          select: { id: true },
        },
      },
    });

    await this.auditService.log({
      actorUserId: actor.id,
      actorEmail: actor.email,
      action: existingUser.role !== updatedUser.role ? 'admin.user.role_changed' : 'admin.user.updated',
      targetType: 'user',
      targetId: updatedUser.id,
      summary: `Updated ${updatedUser.email}`,
      metadata: {
        before: {
          role: existingUser.role,
          isActive: existingUser.isActive,
          operatorName: existingUser.operatorName,
          depotName: existingUser.depotName,
          mustResetPassword: existingUser.mustResetPassword,
          sessionVersion: existingUser.sessionVersion,
        },
        after: {
          role: updatedUser.role,
          isActive: updatedUser.isActive,
          operatorName: updatedUser.operatorName,
          depotName: updatedUser.depotName,
          mustResetPassword: updatedUser.mustResetPassword,
          sessionVersion: updatedUser.sessionVersion,
        },
        reason: dto.reason?.trim() || null,
      } as Prisma.InputJsonValue,
    });

    return this.toAdminUserResponse(updatedUser);
  }

  async resetUserPassword(
    userId: string,
    dto: ResetUserPasswordDto,
    actorUserId?: string | null,
    actorSessionVersion?: string | null,
  ) {
    const actor = await requireAdminActor(this.prisma, actorUserId, actorSessionVersion);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(dto.newPassword),
        mustResetPassword: dto.mustResetPassword ?? true,
        sessionVersion: { increment: 1 },
      },
    });

    await this.auditService.log({
      actorUserId: actor.id,
      actorEmail: actor.email,
      action: 'admin.user.password_reset',
      targetType: 'user',
      targetId: user.id,
      summary: `Reset password for ${user.email}`,
      metadata: {
        mustResetPassword: dto.mustResetPassword ?? true,
        reason: dto.reason?.trim() || null,
      } as Prisma.InputJsonValue,
    });

    return { success: true };
  }

  async deleteUser(
    userId: string,
    dto: DeleteUserDto,
    actorUserId?: string | null,
    actorSessionVersion?: string | null,
  ) {
    const actor = await requireAdminActor(this.prisma, actorUserId, actorSessionVersion);

    if (actor.id === userId) {
      throw new BadRequestException('You cannot delete your own admin account.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deletedAt: new Date(),
        sessionVersion: { increment: 1 },
      },
    });

    await this.auditService.log({
      actorUserId: actor.id,
      actorEmail: actor.email,
      action: 'admin.user.deleted',
      targetType: 'user',
      targetId: user.id,
      summary: `Deleted ${user.email}`,
      metadata: {
        role: user.role,
        operatorName: user.operatorName,
        depotName: user.depotName,
        softDelete: true,
        reason: dto.reason?.trim() || null,
      } as Prisma.InputJsonValue,
    });
  }

  async createFleetAccount(
    dto: CreateFleetAccountDto,
    actorUserId?: string | null,
    actorSessionVersion?: string | null,
  ) {
    const actor = await requireAdminActor(this.prisma, actorUserId, actorSessionVersion);

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email already exists.');
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        role: UserRole.FLEET,
        passwordHash: await hashPassword(dto.password),
        operatorName: dto.operatorName?.trim() || null,
        depotName: dto.depotName?.trim() || null,
        isActive: true,
      },
      include: {
        favoriteStops: {
          select: { id: true },
        },
        subscriptions: {
          where: { isActive: true },
          select: { id: true },
        },
      },
    });

    await this.auditService.log({
      actorUserId: actor.id,
      actorEmail: actor.email,
      action: 'admin.fleet_account.created',
      targetType: 'user',
      targetId: user.id,
      summary: `Created fleet account ${user.email}`,
      metadata: {
        role: user.role,
        operatorName: user.operatorName,
        depotName: user.depotName,
      } as Prisma.InputJsonValue,
    });

    return this.toAdminUserResponse(user);
  }

  async getSystemHealth(actorUserId?: string | null, actorSessionVersion?: string | null) {
    await requireAdminActor(this.prisma, actorUserId, actorSessionVersion);

    const [databaseReachable, busCount, activeShiftCount] = await Promise.all([
      this.prisma.isDatabaseReachable(),
      this.prisma.bus.count().catch(() => 0),
      this.prisma.driverShift.count({
        where: { status: { in: ['ACTIVE', 'SCHEDULED'] } },
      }).catch(() => 0),
    ]);

    const lastSync = this.transitPersistence.getLastSyncStatus();

    return {
      backend: {
        status: 'online',
        checked_at: new Date().toISOString(),
      },
      database: {
        status: databaseReachable ? 'online' : 'offline',
        checked_at: new Date().toISOString(),
      },
      realtime: {
        websocket_status: this.simulationGateway.isReady() ? 'online' : 'starting',
        active_shift_count: activeShiftCount,
      },
      ai: this.aiService.getHealthStatus(),
      transit_sync: lastSync,
      fleet_scope: {
        buses_in_db: busCount,
      },
    };
  }

  async getAuditLogs(actorUserId?: string | null, actorSessionVersion?: string | null) {
    await requireAdminActor(this.prisma, actorUserId, actorSessionVersion);

    const logs = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return logs.map((log) => ({
      id: log.id,
      actor_user_id: log.actorUserId,
      actor_email: log.actorEmail,
      action: log.action,
      target_type: log.targetType,
      target_id: log.targetId,
      summary: log.summary,
      metadata: log.metadata,
      created_at: log.createdAt.toISOString(),
    }));
  }

  async getScopedFleetPreview(actorUserId?: string | null, actorSessionVersion?: string | null) {
    await requireAdminActor(this.prisma, actorUserId, actorSessionVersion);

    const [buses, drivers, shifts] = await Promise.all([
      this.fleetService.getBuses(actorUserId),
      this.fleetService.getDrivers(actorUserId),
      this.fleetService.getDriverShifts(actorUserId),
    ]);

    return {
      buses: buses.length,
      drivers: drivers.length,
      shifts: shifts.length,
    };
  }

  private toAdminUserResponse(user: {
    id: string;
    email: string;
    name: string | null;
    role: UserRole;
    operatorName: string | null;
    depotName: string | null;
    isActive: boolean;
    mustResetPassword: boolean;
    sessionVersion: number;
    lastLoginAt: Date | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    favoriteStops?: Array<{ id: string }>;
    subscriptions?: Array<{ id: string }>;
  }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      operator_name: user.operatorName,
      depot_name: user.depotName,
      is_active: user.isActive,
      must_reset_password: user.mustResetPassword,
      session_version: user.sessionVersion,
      last_login_at: user.lastLoginAt?.toISOString() ?? null,
      deleted_at: user.deletedAt?.toISOString() ?? null,
      favorite_stop_count: user.favoriteStops?.length ?? 0,
      notification_count: user.subscriptions?.length ?? 0,
      created_at: user.createdAt.toISOString(),
      updated_at: user.updatedAt.toISOString(),
    };
  }
}
