import { UserRole } from "@/types/auth";
import { PremiumPlan, PremiumSubscriptionStatus } from "@/types/billing";

export interface AdminUserPremium {
  isPremium: boolean;
  status: PremiumSubscriptionStatus | null;
  plan: PremiumPlan | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
}

export interface AdminUserRecord {
  id: string;
  email: string;
  name?: string | null;
  role: UserRole;
  operatorName?: string | null;
  depotName?: string | null;
  isActive: boolean;
  mustResetPassword: boolean;
  sessionVersion: number;
  lastLoginAt?: string | null;
  deletedAt?: string | null;
  favoriteStopCount: number;
  notificationCount: number;
  premium: AdminUserPremium;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateAdminUserInput {
  role?: UserRole;
  name?: string;
  email?: string;
  operatorName?: string;
  depotName?: string;
  isActive?: boolean;
  mustResetPassword?: boolean;
  reason?: string;
}

export interface CreateFleetAccountInput {
  email: string;
  password: string;
  name?: string;
  operatorName?: string;
  depotName?: string;
}

export interface GrantAdminUserPremiumInput {
  plan: "tourist_weekly" | "monthly";
  reason?: string;
}

export interface SystemHealthSnapshot {
  backend: { status: string; checkedAt: string };
  database: { status: string; checkedAt: string };
  realtime: { websocketStatus: string; activeShiftCount: number };
  ai: { status: string; model: string; configured: boolean; checkedAt: string };
  transitSync: { status: string; checkedAt: string; message: string };
  fleetScope: { busesInDb: number };
}

export interface AuditLogRecord {
  id: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  summary?: string | null;
  metadata?: unknown;
  createdAt: string;
}
