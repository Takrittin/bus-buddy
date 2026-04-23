import { fetchApi } from "@/lib/api-client";
import {
  AdminUserRecord,
  AuditLogRecord,
  CreateFleetAccountInput,
  SystemHealthSnapshot,
  UpdateAdminUserInput,
} from "@/types/admin";

type ApiAdminUser = {
  id: string;
  email: string;
  name?: string | null;
  role: AdminUserRecord["role"];
  operator_name?: string | null;
  depot_name?: string | null;
  is_active: boolean;
  must_reset_password: boolean;
  last_login_at?: string | null;
  favorite_stop_count: number;
  notification_count: number;
  created_at: string;
  updated_at: string;
};

type ApiSystemHealth = {
  backend: { status: string; checked_at: string };
  database: { status: string; checked_at: string };
  realtime: { websocket_status: string; active_shift_count: number };
  ai: { status: string; model: string; configured: boolean; checked_at: string };
  transit_sync: { status: string; checked_at: string; message: string };
  fleet_scope: { buses_in_db: number };
};

type ApiAuditLog = {
  id: string;
  actor_user_id?: string | null;
  actor_email?: string | null;
  action: string;
  target_type: string;
  target_id?: string | null;
  summary?: string | null;
  metadata?: unknown;
  created_at: string;
};

function mapUser(user: ApiAdminUser): AdminUserRecord {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    operatorName: user.operator_name,
    depotName: user.depot_name,
    isActive: user.is_active,
    mustResetPassword: user.must_reset_password,
    lastLoginAt: user.last_login_at,
    favoriteStopCount: user.favorite_stop_count,
    notificationCount: user.notification_count,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

export async function getAdminUsers() {
  const response = await fetchApi<ApiAdminUser[]>("/admin/users");
  return response.map(mapUser);
}

export async function updateAdminUser(userId: string, input: UpdateAdminUserInput) {
  const response = await fetchApi<ApiAdminUser>(`/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return mapUser(response);
}

export async function resetAdminUserPassword(
  userId: string,
  input: { newPassword: string; mustResetPassword?: boolean },
) {
  return fetchApi<{ success: boolean }>(`/admin/users/${userId}/reset-password`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteAdminUser(userId: string) {
  await fetchApi(`/admin/users/${userId}`, {
    method: "DELETE",
  });
}

export async function createFleetAccount(input: CreateFleetAccountInput) {
  const response = await fetchApi<ApiAdminUser>("/admin/fleet-accounts", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapUser(response);
}

export async function getSystemHealth() {
  const response = await fetchApi<ApiSystemHealth>("/admin/system-health");
  const snapshot: SystemHealthSnapshot = {
    backend: {
      status: response.backend.status,
      checkedAt: response.backend.checked_at,
    },
    database: {
      status: response.database.status,
      checkedAt: response.database.checked_at,
    },
    realtime: {
      websocketStatus: response.realtime.websocket_status,
      activeShiftCount: response.realtime.active_shift_count,
    },
    ai: {
      status: response.ai.status,
      model: response.ai.model,
      configured: response.ai.configured,
      checkedAt: response.ai.checked_at,
    },
    transitSync: {
      status: response.transit_sync.status,
      checkedAt: response.transit_sync.checked_at,
      message: response.transit_sync.message,
    },
    fleetScope: {
      busesInDb: response.fleet_scope.buses_in_db,
    },
  };

  return snapshot;
}

export async function getAuditLogs() {
  const response = await fetchApi<ApiAuditLog[]>("/admin/audit-logs");
  return response.map(
    (log): AuditLogRecord => ({
      id: log.id,
      actorUserId: log.actor_user_id,
      actorEmail: log.actor_email,
      action: log.action,
      targetType: log.target_type,
      targetId: log.target_id,
      summary: log.summary,
      metadata: log.metadata,
      createdAt: log.created_at,
    }),
  );
}
