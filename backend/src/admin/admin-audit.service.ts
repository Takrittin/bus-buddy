import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    actorUserId?: string | null;
    actorEmail?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    summary?: string | null;
    metadata?: Prisma.InputJsonValue | null;
  }) {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        summary: input.summary ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  }
}
