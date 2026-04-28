import {
  ConflictException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PremiumSubscriptionStatus, Prisma, UserRole } from '@prisma/client';
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
import { GrantPremiumUserDto, type PremiumGrantPlan } from './dto/grant-premium-user.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

const PREMIUM_ACTIVE_STATUSES: PremiumSubscriptionStatus[] = [
  'ACTIVE',
  'TRIALING',
];
const TOURIST_WEEKLY_PLAN: PremiumGrantPlan = 'tourist_weekly';
const MONTHLY_PLAN: PremiumGrantPlan = 'monthly';
const PREMIUM_PLAN_DURATIONS_DAYS: Record<PremiumGrantPlan, number> = {
  tourist_weekly: 7,
  monthly: 30,
};

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
        premiumSubscription: true,
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
        premiumSubscription: true,
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

  async grantUserPremium(
    userId: string,
    dto: GrantPremiumUserDto,
    actorUserId?: string | null,
    actorSessionVersion?: string | null,
  ) {
    const actor = await requireAdminActor(this.prisma, actorUserId, actorSessionVersion);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { premiumSubscription: true },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (user.deletedAt) {
      throw new BadRequestException('Restore deleted users before granting Premium.');
    }

    if (!user.isActive) {
      throw new BadRequestException('Activate this account before granting Premium.');
    }

    if (user.role !== UserRole.USER) {
      throw new BadRequestException('Premium can only be granted to rider user accounts.');
    }

    const plan = this.normalizePremiumGrantPlan(dto.plan);
    const now = new Date();
    const existingSubscription = user.premiumSubscription;
    const baseStart =
      existingSubscription?.currentPeriodEnd &&
      existingSubscription.currentPeriodEnd.getTime() > now.getTime()
        ? existingSubscription.currentPeriodEnd
        : now;
    const currentPeriodEnd = new Date(
      baseStart.getTime() + PREMIUM_PLAN_DURATIONS_DAYS[plan] * 24 * 60 * 60 * 1000,
    );
    const manualCustomerId =
      existingSubscription?.stripeCustomerId ??
      user.stripeCustomerId ??
      this.getManualPremiumCustomerId(user.id);
    const existingSubscriptionId = existingSubscription?.stripeSubscriptionId;
    const manualSubscriptionId =
      existingSubscriptionId && !existingSubscriptionId.startsWith('qr_')
        ? existingSubscriptionId
        : this.getManualPremiumSubscriptionId(user.id);

    await this.prisma.premiumSubscription.upsert({
      where: { userId: user.id },
      update: {
        stripeCustomerId: manualCustomerId,
        stripeSubscriptionId: manualSubscriptionId,
        stripePriceId: plan,
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd,
        trialEndsAt: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        latestInvoiceId: 'admin_manual',
        latestPaymentStatus: 'admin_granted',
      },
      create: {
        userId: user.id,
        stripeCustomerId: manualCustomerId,
        stripeSubscriptionId: manualSubscriptionId,
        stripePriceId: plan,
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd,
        trialEndsAt: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        latestInvoiceId: 'admin_manual',
        latestPaymentStatus: 'admin_granted',
      },
    });

    await this.auditService.log({
      actorUserId: actor.id,
      actorEmail: actor.email,
      action: 'admin.user.premium_granted',
      targetType: 'user',
      targetId: user.id,
      summary: `Granted ${plan} Premium to ${user.email}`,
      metadata: {
        before: this.toAdminPremiumResponse(existingSubscription),
        after: {
          plan,
          currentPeriodEnd: currentPeriodEnd.toISOString(),
          status: 'ACTIVE',
          source: 'admin_manual',
        },
        reason: dto.reason?.trim() || null,
      } as Prisma.InputJsonValue,
    });

    const updatedUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: {
        favoriteStops: {
          select: { id: true },
        },
        subscriptions: {
          where: { isActive: true },
          select: { id: true },
        },
        premiumSubscription: true,
      },
    });

    if (!updatedUser) {
      throw new NotFoundException('User not found.');
    }

    return this.toAdminUserResponse(updatedUser);
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
        premiumSubscription: true,
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
    premiumSubscription?: {
      status: PremiumSubscriptionStatus;
      stripeSubscriptionId?: string | null;
      stripePriceId?: string | null;
      currentPeriodEnd: Date | null;
      cancelAtPeriodEnd: boolean;
      trialEndsAt: Date | null;
    } | null;
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
      premium: this.toAdminPremiumResponse(user.premiumSubscription ?? null),
      created_at: user.createdAt.toISOString(),
      updated_at: user.updatedAt.toISOString(),
    };
  }

  private toAdminPremiumResponse(
    subscription:
      | {
          status: PremiumSubscriptionStatus;
          stripeSubscriptionId?: string | null;
          stripePriceId?: string | null;
          currentPeriodEnd: Date | null;
          cancelAtPeriodEnd: boolean;
          trialEndsAt: Date | null;
        }
      | null,
  ) {
    return {
      is_premium: this.isPremiumSubscription(subscription),
      status: subscription?.status ?? null,
      plan: this.getPremiumPlan(subscription),
      current_period_end: subscription?.currentPeriodEnd?.toISOString() ?? null,
      cancel_at_period_end: subscription?.cancelAtPeriodEnd ?? false,
      trial_ends_at: subscription?.trialEndsAt?.toISOString() ?? null,
    };
  }

  private isPremiumSubscription(
    subscription:
      | {
          status: PremiumSubscriptionStatus;
          stripeSubscriptionId?: string | null;
          currentPeriodEnd: Date | null;
        }
      | null,
  ) {
    if (
      !subscription ||
      !PREMIUM_ACTIVE_STATUSES.includes(subscription.status) ||
      subscription.stripeSubscriptionId?.startsWith('qr_')
    ) {
      return false;
    }

    if (!subscription.currentPeriodEnd) {
      return true;
    }

    return subscription.currentPeriodEnd.getTime() > Date.now();
  }

  private getPremiumPlan(
    subscription:
      | {
          stripeSubscriptionId?: string | null;
          stripePriceId?: string | null;
        }
      | null,
  ): PremiumGrantPlan | 'unknown' | null {
    if (!subscription) {
      return null;
    }

    if (subscription.stripePriceId === TOURIST_WEEKLY_PLAN) {
      return TOURIST_WEEKLY_PLAN;
    }

    if (subscription.stripePriceId === MONTHLY_PLAN) {
      return MONTHLY_PLAN;
    }

    if (subscription.stripeSubscriptionId?.startsWith('weekly_')) {
      return TOURIST_WEEKLY_PLAN;
    }

    if (subscription.stripeSubscriptionId?.startsWith('sub_')) {
      return MONTHLY_PLAN;
    }

    return subscription.stripePriceId ? 'unknown' : null;
  }

  private normalizePremiumGrantPlan(plan: PremiumGrantPlan) {
    return plan === TOURIST_WEEKLY_PLAN ? TOURIST_WEEKLY_PLAN : MONTHLY_PLAN;
  }

  private getManualPremiumCustomerId(userId: string) {
    return `admin_manual_customer_${userId}`;
  }

  private getManualPremiumSubscriptionId(userId: string) {
    return `admin_manual_subscription_${userId}`;
  }
}
