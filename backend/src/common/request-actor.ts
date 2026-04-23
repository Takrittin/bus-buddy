import {
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type RequestActor = {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'FLEET';
  operatorName: string | null;
  depotName: string | null;
  isActive: boolean;
  mustResetPassword: boolean;
};

export async function resolveRequestActor(
  prisma: PrismaService,
  actorUserId?: string | null,
) {
  if (!actorUserId) {
    throw new UnauthorizedException('Missing user session.');
  }

  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: {
      id: true,
      email: true,
      role: true,
      operatorName: true,
      depotName: true,
      isActive: true,
      mustResetPassword: true,
    },
  });

  if (!actor || !actor.isActive) {
    throw new UnauthorizedException('This account is unavailable.');
  }

  return actor as RequestActor;
}

export async function requireAdminActor(
  prisma: PrismaService,
  actorUserId?: string | null,
) {
  const actor = await resolveRequestActor(prisma, actorUserId);

  if (actor.role !== 'ADMIN') {
    throw new ForbiddenException('Admin access is required.');
  }

  return actor;
}

export async function requireFleetActor(
  prisma: PrismaService,
  actorUserId?: string | null,
) {
  const actor = await resolveRequestActor(prisma, actorUserId);

  if (actor.role !== 'ADMIN' && actor.role !== 'FLEET') {
    throw new ForbiddenException('Fleet access is required.');
  }

  return actor;
}
