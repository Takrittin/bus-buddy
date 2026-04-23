"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/navigation/AppHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { AdminAssistantPanel } from "@/components/ai/AdminAssistantPanel";
import { Button } from "@/components/ui/Button";
import {
  createFleetAccount,
  deleteAdminUser,
  getAdminUsers,
  getAuditLogs,
  getSystemHealth,
  resetAdminUserPassword,
  updateAdminUser,
} from "@/services/admin";
import { useAuth } from "@/hooks/auth/useAuth";
import { AdminUserRecord, AuditLogRecord, SystemHealthSnapshot } from "@/types/admin";
import { UserRole } from "@/types/auth";
import { formatUserRole } from "@/lib/auth/roles";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { Activity, Database, RefreshCw, Shield, UserCog, Users, Wifi } from "lucide-react";

type EditableUser = Record<
  string,
  {
    role: UserRole;
    operatorName: string;
    depotName: string;
    isActive: boolean;
    mustResetPassword: boolean;
  }
>;

const AUDIT_LOGS_PER_PAGE = 20;

export default function AdminPage() {
  const router = useRouter();
  const { locale, t } = useLanguage();
  const { user: currentUser, isAuthenticated, isLoading, isAdmin } = useAuth();
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [health, setHealth] = useState<SystemHealthSnapshot | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [draftUsers, setDraftUsers] = useState<EditableUser>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled" | "deleted">("all");
  const [auditActionFilter, setAuditActionFilter] = useState("all");
  const [auditActorQuery, setAuditActorQuery] = useState("");
  const [auditDateFrom, setAuditDateFrom] = useState("");
  const [auditDateTo, setAuditDateTo] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const [fleetForm, setFleetForm] = useState({
    name: "",
    email: "",
    password: "",
    operatorName: "",
    depotName: "",
  });

  const loadAdminData = async () => {
    setIsRefreshing(true);
    setError(null);

    try {
      const [nextUsers, nextHealth, nextLogs] = await Promise.all([
        getAdminUsers(),
        getSystemHealth(),
        getAuditLogs(),
      ]);

      setUsers(nextUsers);
      setHealth(nextHealth);
      setAuditLogs(nextLogs);
      setDraftUsers(
        Object.fromEntries(
          nextUsers.map((user) => [
            user.id,
            {
              role: user.role,
              operatorName: user.operatorName ?? "",
              depotName: user.depotName ?? "",
              isActive: user.isActive,
              mustResetPassword: user.mustResetPassword,
            },
          ]),
        ),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("admin.loadError"));
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      router.replace("/settings");
      return;
    }

    if (!isAdmin) {
      router.replace("/");
      return;
    }

    void loadAdminData();
  }, [isAdmin, isAuthenticated, isLoading, router]);

  const stats = useMemo(() => {
    const activeUsers = users.filter((user) => user.isActive && !user.deletedAt).length;
    const fleetAccounts = users.filter((user) => user.role === "FLEET").length;
    const passwordResetUsers = users.filter((user) => user.mustResetPassword).length;

    return { activeUsers, fleetAccounts, passwordResetUsers };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = userSearchQuery.trim().toLowerCase();

    return users.filter((user) => {
      const matchesQuery =
        !normalizedQuery ||
        user.email.toLowerCase().includes(normalizedQuery) ||
        (user.name ?? "").toLowerCase().includes(normalizedQuery);
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && user.isActive && !user.deletedAt) ||
        (statusFilter === "disabled" && !user.isActive && !user.deletedAt) ||
        (statusFilter === "deleted" && Boolean(user.deletedAt));

      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [roleFilter, statusFilter, userSearchQuery, users]);

  const auditActionOptions = useMemo(
    () => ["all", ...Array.from(new Set(auditLogs.map((log) => log.action))).sort()],
    [auditLogs],
  );

  const filteredAuditLogs = useMemo(() => {
    const actorQuery = auditActorQuery.trim().toLowerCase();
    const fromTime = auditDateFrom ? new Date(`${auditDateFrom}T00:00:00`).getTime() : null;
    const toTime = auditDateTo ? new Date(`${auditDateTo}T23:59:59`).getTime() : null;

    return auditLogs.filter((log) => {
      const createdTime = new Date(log.createdAt).getTime();
      const matchesAction = auditActionFilter === "all" || log.action === auditActionFilter;
      const matchesActor =
        !actorQuery || (log.actorEmail ?? "system").toLowerCase().includes(actorQuery);
      const matchesFrom = fromTime === null || createdTime >= fromTime;
      const matchesTo = toTime === null || createdTime <= toTime;

      return matchesAction && matchesActor && matchesFrom && matchesTo;
    });
  }, [auditActionFilter, auditActorQuery, auditDateFrom, auditDateTo, auditLogs]);

  useEffect(() => {
    setAuditPage(1);
  }, [auditActionFilter, auditActorQuery, auditDateFrom, auditDateTo]);

  const auditPageCount = Math.max(1, Math.ceil(filteredAuditLogs.length / AUDIT_LOGS_PER_PAGE));
  const safeAuditPage = Math.min(auditPage, auditPageCount);
  const auditPageStartIndex = (safeAuditPage - 1) * AUDIT_LOGS_PER_PAGE;
  const paginatedAuditLogs = filteredAuditLogs.slice(
    auditPageStartIndex,
    auditPageStartIndex + AUDIT_LOGS_PER_PAGE,
  );
  const auditPageFrom = filteredAuditLogs.length === 0 ? 0 : auditPageStartIndex + 1;
  const auditPageTo = Math.min(auditPageStartIndex + AUDIT_LOGS_PER_PAGE, filteredAuditLogs.length);

  const getReason = (message: string) => {
    const reason = window.prompt(message);
    return reason?.trim() || null;
  };

  const formatDateTime = (value: string | null | undefined) => {
    if (!value) {
      return t("admin.never");
    }

    return new Date(value).toLocaleString(locale === "th" ? "th-TH" : "en-US");
  };

  const formatHealthStatus = (value: string | null | undefined) => {
    const normalizedValue = value?.toLowerCase();
    const statusLabels: Record<string, string> = {
      online: t("admin.statusOnline"),
      offline: t("admin.statusOffline"),
      starting: t("admin.statusStarting"),
      degraded: t("admin.statusDegraded"),
      pending: t("admin.statusPending"),
      success: t("admin.statusSuccess"),
      failed: t("admin.statusFailed"),
      skipped: t("admin.statusSkipped"),
    };

    return normalizedValue
      ? statusLabels[normalizedValue] ?? value ?? t("admin.checking")
      : t("admin.checking");
  };

  const handleSaveUser = async (userId: string) => {
    const draft = draftUsers[userId];
    const originalUser = users.find((user) => user.id === userId);

    if (!draft || !originalUser) {
      return;
    }

    const isSelf = currentUser?.id === userId;
    const roleChanged = draft.role !== originalUser.role;
    const promotedToAdmin = draft.role === "ADMIN" && originalUser.role !== "ADMIN";
    const disabledAccount = draft.isActive === false && originalUser.isActive;
    const resetFlagAdded = draft.mustResetPassword && !originalUser.mustResetPassword;

    if (isSelf && (draft.role !== "ADMIN" || draft.isActive === false)) {
      setError(t("admin.selfProtectionError"));
      return;
    }

    if (promotedToAdmin || disabledAccount) {
      const confirmed = window.confirm(
        promotedToAdmin ? t("admin.promoteConfirm") : t("admin.disableConfirm"),
      );

      if (!confirmed) {
        return;
      }
    }

    const reason =
      roleChanged || disabledAccount || resetFlagAdded
        ? getReason(t("admin.adminActionReason"))
        : null;

    if ((roleChanged || disabledAccount || resetFlagAdded) && !reason) {
      return;
    }

    try {
      const updatedUser = await updateAdminUser(userId, {
        role: draft.role,
        isActive: draft.isActive,
        mustResetPassword: draft.mustResetPassword,
        reason: reason ?? undefined,
      });
      setUsers((currentUsers) =>
        currentUsers.map((user) => (user.id === userId ? updatedUser : user)),
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t("admin.updateError"));
    }
  };

  const handleResetPassword = async (user: AdminUserRecord) => {
    const newPassword = window.prompt(t("admin.resetPasswordPrompt", { email: user.email }));

    if (!newPassword) {
      return;
    }

    const reason = getReason(t("admin.resetPasswordReason"));

    if (!reason) {
      return;
    }

    try {
      await resetAdminUserPassword(user.id, {
        newPassword,
        mustResetPassword: true,
        reason,
      });
      await loadAdminData();
    } catch (resetError) {
      setError(
        resetError instanceof Error ? resetError.message : t("admin.resetError"),
      );
    }
  };

  const handleDeleteUser = async (user: AdminUserRecord) => {
    if (currentUser?.id === user.id) {
      setError(t("admin.selfDeleteError"));
      return;
    }

    const confirmed = window.confirm(
      t("admin.deleteConfirm", { email: user.email }),
    );

    if (!confirmed) {
      return;
    }

    const reason = getReason(t("admin.deleteReason"));

    if (!reason) {
      return;
    }

    try {
      await deleteAdminUser(user.id, { reason });
      await loadAdminData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("admin.deleteError"));
    }
  };

  const handleCreateFleetAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      await createFleetAccount(fleetForm);
      setFleetForm({
        name: "",
        email: "",
        password: "",
        operatorName: "",
        depotName: "",
      });
      await loadAdminData();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : t("admin.createFleetError"),
      );
    }
  };

  if (isLoading || (!isAuthenticated && !error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500">
        {t("admin.loading")}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col overflow-hidden bg-gray-50">
      <AppHeader />

      <div className="flex flex-1 pt-[60px]">
        <BottomNav />

        <main className="flex-1 overflow-y-auto pb-24 md:pb-8 md:pl-20">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-8">
            <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">
                    {t("admin.eyebrow")}
                  </p>
                  <h1 className="mt-2 text-3xl font-bold text-gray-900">{t("admin.title")}</h1>
                  <p className="mt-2 max-w-3xl text-sm text-gray-500">
                    {t("admin.subtitle")}
                  </p>
                </div>

                <Button variant="outline" onClick={() => void loadAdminData()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {isRefreshing ? t("admin.refreshing") : t("admin.refresh")}
                </Button>
              </div>

              {error ? (
                <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
            </section>

            <section className="grid gap-4 md:grid-cols-4">
              <HealthCard
                icon={Users}
                title={t("admin.activeUsers")}
                value={String(stats.activeUsers)}
                detail={t("admin.fleetAccounts", { count: stats.fleetAccounts })}
              />
              <HealthCard
                icon={Shield}
                title={t("admin.passwordResets")}
                value={String(stats.passwordResetUsers)}
                detail={t("admin.passwordResetDetail")}
              />
              <HealthCard
                icon={Database}
                title={t("admin.database")}
                value={formatHealthStatus(health?.database.status)}
                detail={health?.transitSync.message ?? t("admin.waitingHealth")}
              />
              <HealthCard
                icon={Wifi}
                title={t("admin.realtime")}
                value={formatHealthStatus(health?.realtime.websocketStatus)}
                detail={t("admin.activeScheduledShifts", {
                  count: health?.realtime.activeShiftCount ?? 0,
                })}
              />
            </section>

            <section className="grid gap-6">
              <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-orange-100 p-3 text-brand">
                    <UserCog className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      {t("admin.userManagement")}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      {t("admin.userManagementSubtitle")}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-[1.4fr_0.8fr_0.8fr]">
                  <input
                    value={userSearchQuery}
                    onChange={(event) => setUserSearchQuery(event.target.value)}
                    placeholder={t("admin.searchUsersPlaceholder")}
                    className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition-colors focus:border-brand"
                  />
                  <select
                    value={roleFilter}
                    onChange={(event) => setRoleFilter(event.target.value as "all" | UserRole)}
                    className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition-colors focus:border-brand"
                  >
                    <option value="all">{t("admin.allRoles")}</option>
                    <option value="USER">{formatUserRole("USER", locale)}</option>
                    <option value="FLEET">{formatUserRole("FLEET", locale)}</option>
                    <option value="ADMIN">{formatUserRole("ADMIN", locale)}</option>
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as typeof statusFilter)
                    }
                    className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition-colors focus:border-brand"
                  >
                    <option value="all">{t("admin.allStatuses")}</option>
                    <option value="active">{t("admin.active")}</option>
                    <option value="disabled">{t("admin.disabled")}</option>
                    <option value="deleted">{t("admin.deleted")}</option>
                  </select>
                </div>

                <div className="mt-6 max-h-[640px] overflow-auto rounded-2xl border border-gray-100">
                  <table className="min-w-[1100px] divide-y divide-gray-100 text-left text-sm xl:min-w-full">
                    <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_rgba(229,231,235,1)]">
                      <tr className="text-xs uppercase tracking-[0.14em] text-gray-500">
                        <th className="px-3 py-3">{t("admin.user")}</th>
                        <th className="px-3 py-3">{t("admin.role")}</th>
                        <th className="px-3 py-3">{t("admin.status")}</th>
                        <th className="px-3 py-3">{t("admin.signals")}</th>
                        <th className="px-3 py-3">{t("admin.actions")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredUsers.map((user) => {
                        const draft = draftUsers[user.id];
                        const isSelf = currentUser?.id === user.id;
                        const isDeleted = Boolean(user.deletedAt);

                        return (
                          <tr key={user.id} className={`align-top ${isDeleted ? "bg-gray-50 opacity-75" : ""}`}>
                            <td className="px-3 py-4">
                              <p className="font-semibold text-gray-900">
                                {user.name || t("admin.unnamedUser")}
                              </p>
                              <p className="mt-1 text-xs text-gray-500">{user.email}</p>
                              <p className="mt-2 text-xs text-gray-400">
                                {t("admin.lastLogin", {
                                  value: formatDateTime(user.lastLoginAt),
                                })}
                              </p>
                              {isDeleted ? (
                                <p className="mt-2 text-xs font-semibold text-red-600">
                                  {t("admin.deletedAt", {
                                    value: formatDateTime(user.deletedAt),
                                  })}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-3 py-4">
                              <select
                                value={draft?.role ?? user.role}
                                disabled={isDeleted}
                                onChange={(event) =>
                                  setDraftUsers((current) => ({
                                    ...current,
                                    [user.id]: {
                                      ...current[user.id],
                                      role: event.target.value as UserRole,
                                    },
                                  }))
                                }
                                className="w-full rounded-2xl border border-gray-200 px-3 py-2"
                              >
                                {(["USER", "FLEET", "ADMIN"] as UserRole[]).map((role) => (
                                  <option key={role} value={role}>
                                    {formatUserRole(role, locale)}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="space-y-3 px-3 py-4">
                              <label className="flex items-center gap-2 text-xs text-gray-600">
                                <input
                                  type="checkbox"
                                  checked={draft?.isActive ?? user.isActive}
                                  disabled={isDeleted || isSelf}
                                  onChange={(event) =>
                                    setDraftUsers((current) => ({
                                      ...current,
                                      [user.id]: {
                                        ...current[user.id],
                                        isActive: event.target.checked,
                                      },
                                    }))
                                  }
                                />
                                {t("admin.active")}
                              </label>
                              <label className="flex items-center gap-2 text-xs text-gray-600">
                                <input
                                  type="checkbox"
                                  checked={draft?.mustResetPassword ?? user.mustResetPassword}
                                  disabled={isDeleted}
                                  onChange={(event) =>
                                    setDraftUsers((current) => ({
                                      ...current,
                                      [user.id]: {
                                        ...current[user.id],
                                        mustResetPassword: event.target.checked,
                                      },
                                    }))
                                  }
                                />
                                {t("admin.forcePasswordReset")}
                              </label>
                            </td>
                            <td className="px-3 py-4 text-xs text-gray-500">
                              <p>
                                {t("admin.favoriteStops", { count: user.favoriteStopCount })}
                              </p>
                              <p className="mt-1">
                                {t("admin.alertSubscriptions", {
                                  count: user.notificationCount,
                                })}
                              </p>
                            </td>
                            <td className="space-y-2 px-3 py-4">
                              <Button
                                variant="primary"
                                className="w-full"
                                disabled={isDeleted}
                                onClick={() => void handleSaveUser(user.id)}
                              >
                                {t("admin.save")}
                              </Button>
                              <Button
                                variant="outline"
                                className="w-full"
                                disabled={isDeleted}
                                onClick={() => void handleResetPassword(user)}
                              >
                                {t("admin.resetPassword")}
                              </Button>
                              <Button
                                variant="ghost"
                                className="w-full text-red-600 hover:bg-red-50 hover:text-red-700"
                                disabled={isDeleted || isSelf}
                                onClick={() => void handleDeleteUser(user)}
                              >
                                {t("admin.deleteUser")}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                  <h2 className="text-2xl font-bold text-gray-900">
                    {t("admin.createFleetManager")}
                  </h2>
                  <p className="mt-2 text-sm text-gray-500">
                    {t("admin.createFleetManagerSubtitle")}
                  </p>

                  <form className="mt-5 space-y-3" onSubmit={handleCreateFleetAccount}>
                    <input
                      value={fleetForm.name}
                      onChange={(event) =>
                        setFleetForm((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder={t("admin.fullName")}
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3"
                    />
                    <input
                      type="email"
                      value={fleetForm.email}
                      onChange={(event) =>
                        setFleetForm((current) => ({ ...current, email: event.target.value }))
                      }
                      placeholder="fleet.manager@example.com"
                      required
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3"
                    />
                    <input
                      type="password"
                      value={fleetForm.password}
                      onChange={(event) =>
                        setFleetForm((current) => ({ ...current, password: event.target.value }))
                      }
                      placeholder={t("admin.temporaryPassword")}
                      required
                      minLength={8}
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3"
                    />
                    <input
                      value={fleetForm.operatorName}
                      onChange={(event) =>
                        setFleetForm((current) => ({
                          ...current,
                          operatorName: event.target.value,
                        }))
                      }
                      placeholder={t("admin.operator")}
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3"
                    />
                    <input
                      value={fleetForm.depotName}
                      onChange={(event) =>
                        setFleetForm((current) => ({
                          ...current,
                          depotName: event.target.value,
                        }))
                      }
                      placeholder={t("admin.depot")}
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3"
                    />

                    <Button variant="primary" className="w-full" type="submit">
                      {t("admin.createFleetAccount")}
                    </Button>
                  </form>
                </section>

                <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <Activity className="h-5 w-5 text-brand" />
                    <h2 className="text-2xl font-bold text-gray-900">
                      {t("admin.systemHealth")}
                    </h2>
                  </div>
                  <div className="mt-5 space-y-3 text-sm">
                    <HealthRow
                      label={t("admin.backend")}
                      value={formatHealthStatus(health?.backend.status)}
                    />
                    <HealthRow
                      label={t("admin.database")}
                      value={formatHealthStatus(health?.database.status)}
                    />
                    <HealthRow
                      label={t("admin.transitSync")}
                      value={formatHealthStatus(health?.transitSync.status)}
                      detail={health?.transitSync.message}
                    />
                    <HealthRow
                      label={t("admin.websocket")}
                      value={formatHealthStatus(health?.realtime.websocketStatus)}
                    />
                    <HealthRow
                      label={t("admin.aiService")}
                      value={formatHealthStatus(health?.ai.status)}
                      detail={health?.ai.model}
                    />
                  </div>
                </section>
              </div>
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-bold text-gray-900">{t("admin.auditLog")}</h2>
              <p className="mt-2 text-sm text-gray-500">
                {t("admin.auditLogSubtitle")}
              </p>

              <div className="mt-6 grid gap-3 md:grid-cols-4">
                <select
                  value={auditActionFilter}
                  onChange={(event) => setAuditActionFilter(event.target.value)}
                  className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition-colors focus:border-brand"
                >
                  {auditActionOptions.map((action) => (
                    <option key={action} value={action}>
                      {action === "all" ? t("admin.allActions") : action}
                    </option>
                  ))}
                </select>
                <input
                  value={auditActorQuery}
                  onChange={(event) => setAuditActorQuery(event.target.value)}
                  placeholder={t("admin.actorEmail")}
                  className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition-colors focus:border-brand"
                />
                <input
                  type="date"
                  value={auditDateFrom}
                  onChange={(event) => setAuditDateFrom(event.target.value)}
                  className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition-colors focus:border-brand"
                />
                <input
                  type="date"
                  value={auditDateTo}
                  onChange={(event) => setAuditDateTo(event.target.value)}
                  className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition-colors focus:border-brand"
                />
              </div>

              <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-100">
                <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
                  <thead className="bg-white">
                    <tr className="text-xs uppercase tracking-[0.14em] text-gray-500">
                      <th className="px-3 py-3">{t("admin.when")}</th>
                      <th className="px-3 py-3">{t("admin.actor")}</th>
                      <th className="px-3 py-3">{t("admin.action")}</th>
                      <th className="px-3 py-3">{t("admin.summary")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedAuditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="px-3 py-3 text-gray-500">
                          {formatDateTime(log.createdAt)}
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          {log.actorEmail || t("admin.systemActor")}
                        </td>
                        <td className="px-3 py-3 font-medium text-gray-900">{log.action}</td>
                        <td className="px-3 py-3 text-gray-600">
                          {log.summary || "-"}
                          {typeof log.metadata === "object" &&
                          log.metadata &&
                          "reason" in log.metadata &&
                          typeof log.metadata.reason === "string" &&
                          log.metadata.reason ? (
                            <p className="mt-1 text-xs text-gray-400">
                              {t("admin.reason", { value: log.metadata.reason })}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-col gap-3 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  {t("admin.auditPageSummary", {
                    from: auditPageFrom,
                    to: auditPageTo,
                    total: filteredAuditLogs.length,
                  })}
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    disabled={safeAuditPage <= 1}
                    onClick={() => setAuditPage((page) => Math.max(1, page - 1))}
                  >
                    {t("admin.previousPage")}
                  </Button>
                  <span className="rounded-full bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">
                    {t("admin.auditPageIndicator", {
                      current: safeAuditPage,
                      total: auditPageCount,
                    })}
                  </span>
                  <Button
                    variant="outline"
                    disabled={safeAuditPage >= auditPageCount}
                    onClick={() => setAuditPage((page) => Math.min(auditPageCount, page + 1))}
                  >
                    {t("admin.nextPage")}
                  </Button>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      {isAuthenticated && isAdmin ? <AdminAssistantPanel activeSection="admin-console" /> : null}
    </div>
  );
}

function HealthCard({
  icon: Icon,
  title,
  value,
  detail,
}: {
  icon: typeof Users;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-orange-100 p-3 text-brand">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-gray-500">{detail}</p>
    </div>
  );
}

function HealthRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-gray-600">{label}</span>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-gray-700">
          {value}
        </span>
      </div>
      {detail ? <p className="mt-2 text-xs text-gray-500">{detail}</p> : null}
    </div>
  );
}
