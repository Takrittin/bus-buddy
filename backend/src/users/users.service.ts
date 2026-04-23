import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { resolveRequestActor } from "../common/request-actor";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { hashPassword } from "./password.util";

type FavoriteStopWithRelations = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  landmark: string | null;
  areaDescription: string | null;
  isMajorStop: boolean;
  isInterchange: boolean;
  stopRoutes: Array<{
    routeId: string;
    sequence: number;
    direction: "OUTBOUND" | "INBOUND";
    route: {
      shortName: string;
      longName: string | null;
    };
  }>;
};

type SubscriptionWithRelations = {
  id: string;
  userId: string;
  stopId: string;
  routeId: string;
  leadTimeMinutes: number;
  isActive: boolean;
  stop: {
    name: string;
  };
  route: {
    shortName: string;
  };
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    const {
      email,
      name,
      role,
      operatorName,
      depotName,
      isActive,
      mustResetPassword,
      favoriteStopIds,
      password,
    } = createUserDto;
    const passwordHash = await hashPassword(password);

    const user = await this.prisma.user.create({
      data: {
        email,
        name,
        role,
        operatorName,
        depotName,
        isActive,
        mustResetPassword,
        passwordHash,
        favoriteStops: favoriteStopIds ? {
          create: favoriteStopIds.map((id) => ({ stopId: id })),
        } : undefined,
      },
      include: {
        favoriteStops: true,
        subscriptions: true,
      },
    });

    return this.sanitizeUser(user);
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      include: {
        favoriteStops: true,
        subscriptions: true,
      },
    });

    return users.map((user) => this.sanitizeUser(user));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        favoriteStops: true,
        subscriptions: true,
      },
    });

    return this.sanitizeUser(user);
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const {
      email,
      name,
      role,
      operatorName,
      depotName,
      isActive,
      mustResetPassword,
      favoriteStopIds,
      password,
    } = updateUserDto;
    const passwordHash = password ? await hashPassword(password) : undefined;

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        email,
        name,
        role: role ?? undefined,
        operatorName,
        depotName,
        isActive,
        mustResetPassword,
        passwordHash: passwordHash ?? undefined,
        // Using deleteMany and create to accurately replace the connections based on user input
        favoriteStops: favoriteStopIds ? {
          deleteMany: {},
          create: favoriteStopIds.map((stopId) => ({ stopId })),
        } : undefined,
      },
      include: {
        favoriteStops: true,
        subscriptions: true,
      },
    });

    return this.sanitizeUser(user);
  }

  async remove(id: string) {
    const user = await this.prisma.user.delete({
      where: { id },
    });

    return this.sanitizeUser(user);
  }

  async getFavoriteStops(
    userId: string,
    actorUserId?: string | null,
    actorSessionVersion?: string | null,
  ) {
    await this.ensureUserAccess(userId, actorUserId, actorSessionVersion);

    const favorites = await this.prisma.favoriteStop.findMany({
      where: { userId },
      include: {
        stop: {
          include: {
            stopRoutes: {
              include: {
                route: {
                  select: {
                    shortName: true,
                    longName: true,
                  },
                },
              },
              orderBy: [
                { routeId: "asc" },
                { direction: "asc" },
                { sequence: "asc" },
              ],
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return favorites.map(({ stop }) => this.toStopResponse(stop));
  }

  async addFavoriteStop(
    userId: string,
    stopId: string,
    actorUserId?: string | null,
    actorSessionVersion?: string | null,
  ) {
    await Promise.all([
      this.ensureUserAccess(userId, actorUserId, actorSessionVersion),
      this.ensureStopExists(stopId),
    ]);

    await this.prisma.favoriteStop.upsert({
      where: {
        userId_stopId: {
          userId,
          stopId,
        },
      },
      update: {},
      create: {
        userId,
        stopId,
      },
    });

    const stop = await this.prisma.busStop.findUnique({
      where: { id: stopId },
      include: {
        stopRoutes: {
          include: {
            route: {
              select: {
                shortName: true,
                longName: true,
              },
            },
          },
          orderBy: [
            { routeId: "asc" },
            { direction: "asc" },
            { sequence: "asc" },
          ],
        },
      },
    });

    if (!stop) {
      throw new NotFoundException("Stop not found.");
    }

    return this.toStopResponse(stop);
  }

  async removeFavoriteStop(
    userId: string,
    stopId: string,
    actorUserId?: string | null,
    actorSessionVersion?: string | null,
  ) {
    await this.ensureUserAccess(userId, actorUserId, actorSessionVersion);

    await this.prisma.favoriteStop.deleteMany({
      where: {
        userId,
        stopId,
      },
    });
  }

  async getNotificationSubscriptions(
    userId: string,
    actorUserId?: string | null,
    actorSessionVersion?: string | null,
  ) {
    await this.ensureUserAccess(userId, actorUserId, actorSessionVersion);

    const subscriptions = await this.prisma.notificationSubscription.findMany({
      where: {
        userId,
        isActive: true,
      },
      include: {
        stop: {
          select: {
            name: true,
          },
        },
        route: {
          select: {
            shortName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return subscriptions.map((subscription) =>
      this.toNotificationSubscriptionResponse(subscription),
    );
  }

  async findNotificationSubscription(
    userId: string,
    stopId: string,
    routeId: string,
    actorUserId?: string | null,
    actorSessionVersion?: string | null,
  ) {
    await this.ensureUserAccess(userId, actorUserId, actorSessionVersion);

    const subscription = await this.prisma.notificationSubscription.findFirst({
      where: {
        userId,
        stopId,
        routeId,
        isActive: true,
      },
      include: {
        stop: {
          select: {
            name: true,
          },
        },
        route: {
          select: {
            shortName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return subscription
      ? this.toNotificationSubscriptionResponse(subscription)
      : null;
  }

  async addNotificationSubscription(input: {
    userId: string;
    stopId: string;
    routeId: string;
    leadTimeMinutes: number;
    isActive?: boolean;
    actorUserId?: string | null;
    actorSessionVersion?: string | null;
  }) {
    const {
      userId,
      stopId,
      routeId,
      leadTimeMinutes,
      isActive = true,
      actorUserId,
      actorSessionVersion,
    } = input;

    await Promise.all([
      this.ensureUserAccess(userId, actorUserId, actorSessionVersion),
      this.ensureStopExists(stopId),
      this.ensureRouteExists(routeId),
    ]);

    const subscription = await this.prisma.notificationSubscription.upsert({
      where: {
        userId_routeId_stopId: {
          userId,
          routeId,
          stopId,
        },
      },
      update: {
        leadTimeMinutes,
        isActive,
      },
      create: {
        userId,
        routeId,
        stopId,
        leadTimeMinutes,
        isActive,
      },
      include: {
        stop: {
          select: {
            name: true,
          },
        },
        route: {
          select: {
            shortName: true,
          },
        },
      },
    });

    return this.toNotificationSubscriptionResponse(subscription);
  }

  async removeNotificationSubscription(
    userId: string,
    subscriptionId: string,
    actorUserId?: string | null,
    actorSessionVersion?: string | null,
  ) {
    await this.ensureUserAccess(userId, actorUserId, actorSessionVersion);

    await this.prisma.notificationSubscription.deleteMany({
      where: {
        id: subscriptionId,
        userId,
      },
    });
  }

  async changePassword(
    userId: string,
    input: { password: string },
    actorUserId?: string | null,
    actorSessionVersion?: string | null,
  ) {
    const actor = await resolveRequestActor(this.prisma, actorUserId, actorSessionVersion);

    if (actor.id !== userId && actor.role !== "ADMIN") {
      throw new ForbiddenException("You cannot change another user's password.");
    }

    await this.ensureUserExists(userId);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(input.password),
        mustResetPassword: false,
      },
    });

    return { success: true };
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException("User not found.");
    }
  }

  private async ensureUserAccess(
    userId: string,
    actorUserId?: string | null,
    actorSessionVersion?: string | null,
  ) {
    const actor = await resolveRequestActor(this.prisma, actorUserId, actorSessionVersion);

    if (actor.id !== userId && actor.role !== "ADMIN") {
      throw new ForbiddenException("You cannot access another user's data.");
    }
  }

  private async ensureStopExists(stopId: string) {
    const stop = await this.prisma.busStop.findUnique({
      where: { id: stopId },
      select: { id: true },
    });

    if (!stop) {
      throw new NotFoundException("Stop not found.");
    }
  }

  private async ensureRouteExists(routeId: string) {
    const route = await this.prisma.route.findUnique({
      where: { id: routeId },
      select: { id: true },
    });

    if (!route) {
      throw new NotFoundException("Route not found.");
    }
  }

  private toStopResponse(stop: FavoriteStopWithRelations) {
    const routeAssignments = stop.stopRoutes.map((assignment) => ({
      route_id: assignment.routeId,
      route_number: assignment.route.shortName,
      route_name: assignment.route.longName ?? assignment.route.shortName,
      direction:
        assignment.direction === "OUTBOUND" ? "outbound" : "inbound",
      sequence: assignment.sequence,
    }));

    return {
      stop_id: stop.id,
      stop_name: stop.name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      route_ids: Array.from(
        new Set(routeAssignments.map((assignment) => assignment.route_id)),
      ),
      landmark: stop.landmark ?? "",
      area_description: stop.areaDescription ?? "",
      is_major_stop: stop.isMajorStop,
      is_interchange: stop.isInterchange,
      route_assignments: routeAssignments,
    };
  }

  private toNotificationSubscriptionResponse(
    subscription: SubscriptionWithRelations,
  ) {
    return {
      id: subscription.id,
      user_id: subscription.userId,
      stop_id: subscription.stopId,
      stop_name: subscription.stop.name,
      route_id: subscription.routeId,
      route_number: subscription.route.shortName,
      lead_time_minutes: subscription.leadTimeMinutes,
      is_active: subscription.isActive,
    };
  }

  private sanitizeUser(user: any) {
    if (!user) {
      return user;
    }

    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }
}
