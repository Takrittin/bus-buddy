"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/navigation/AppHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
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

export default function AdminPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, isAdmin } = useAuth();
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [health, setHealth] = useState<SystemHealthSnapshot | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [draftUsers, setDraftUsers] = useState<EditableUser>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setError(loadError instanceof Error ? loadError.message : "Unable to load admin data.");
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
    const activeUsers = users.filter((user) => user.isActive).length;
    const fleetAccounts = users.filter((user) => user.role === "FLEET").length;
    const passwordResetUsers = users.filter((user) => user.mustResetPassword).length;

    return { activeUsers, fleetAccounts, passwordResetUsers };
  }, [users]);

  const handleSaveUser = async (userId: string) => {
    const draft = draftUsers[userId];

    if (!draft) {
      return;
    }

    try {
      const updatedUser = await updateAdminUser(userId, draft);
      setUsers((currentUsers) =>
        currentUsers.map((user) => (user.id === userId ? updatedUser : user)),
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update user.");
    }
  };

  const handleResetPassword = async (user: AdminUserRecord) => {
    const newPassword = window.prompt(`Set a new temporary password for ${user.email}`);

    if (!newPassword) {
      return;
    }

    try {
      await resetAdminUserPassword(user.id, {
        newPassword,
        mustResetPassword: true,
      });
      await loadAdminData();
    } catch (resetError) {
      setError(
        resetError instanceof Error ? resetError.message : "Unable to reset password.",
      );
    }
  };

  const handleDeleteUser = async (user: AdminUserRecord) => {
    const confirmed = window.confirm(
      `Delete ${user.email}? This will remove their favorites and alert subscriptions too.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteAdminUser(user.id);
      await loadAdminData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete user.");
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
        createError instanceof Error ? createError.message : "Unable to create fleet account.",
      );
    }
  };

  if (isLoading || (!isAuthenticated && !error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500">
        Loading admin workspace...
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
                    Admin
                  </p>
                  <h1 className="mt-2 text-3xl font-bold text-gray-900">Admin Console</h1>
                  <p className="mt-2 max-w-3xl text-sm text-gray-500">
                    Manage users, fleet accounts, system health, and audit logs from one place.
                  </p>
                </div>

                <Button variant="outline" onClick={() => void loadAdminData()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {isRefreshing ? "Refreshing..." : "Refresh"}
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
                title="Active users"
                value={String(stats.activeUsers)}
                detail={`${stats.fleetAccounts} fleet accounts`}
              />
              <HealthCard
                icon={Shield}
                title="Password resets"
                value={String(stats.passwordResetUsers)}
                detail="Accounts that must change password"
              />
              <HealthCard
                icon={Database}
                title="Database"
                value={health?.database.status ?? "checking"}
                detail={health?.transitSync.message ?? "Waiting for health snapshot"}
              />
              <HealthCard
                icon={Wifi}
                title="Realtime"
                value={health?.realtime.websocketStatus ?? "checking"}
                detail={`${health?.realtime.activeShiftCount ?? 0} active/scheduled shifts`}
              />
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
              <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-orange-100 p-3 text-brand">
                    <UserCog className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Review users, change roles, disable accounts, and require password resets.
                    </p>
                  </div>
                </div>

                <div className="mt-6 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
                    <thead>
                      <tr className="text-xs uppercase tracking-[0.14em] text-gray-500">
                        <th className="px-3 py-3">User</th>
                        <th className="px-3 py-3">Role</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3">Signals</th>
                        <th className="px-3 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {users.map((user) => {
                        const draft = draftUsers[user.id];

                        return (
                          <tr key={user.id} className="align-top">
                            <td className="px-3 py-4">
                              <p className="font-semibold text-gray-900">
                                {user.name || "Unnamed user"}
                              </p>
                              <p className="mt-1 text-xs text-gray-500">{user.email}</p>
                              <p className="mt-2 text-xs text-gray-400">
                                Last login: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
                              </p>
                            </td>
                            <td className="px-3 py-4">
                              <select
                                value={draft?.role ?? user.role}
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
                                    {formatUserRole(role)}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="space-y-3 px-3 py-4">
                              <label className="flex items-center gap-2 text-xs text-gray-600">
                                <input
                                  type="checkbox"
                                  checked={draft?.isActive ?? user.isActive}
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
                                Active
                              </label>
                              <label className="flex items-center gap-2 text-xs text-gray-600">
                                <input
                                  type="checkbox"
                                  checked={draft?.mustResetPassword ?? user.mustResetPassword}
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
                                Force password reset
                              </label>
                            </td>
                            <td className="px-3 py-4 text-xs text-gray-500">
                              <p>{user.favoriteStopCount} favorite stops</p>
                              <p className="mt-1">{user.notificationCount} alert subscriptions</p>
                            </td>
                            <td className="space-y-2 px-3 py-4">
                              <Button
                                variant="primary"
                                className="w-full"
                                onClick={() => void handleSaveUser(user.id)}
                              >
                                Save
                              </Button>
                              <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => void handleResetPassword(user)}
                              >
                                Reset Password
                              </Button>
                              <Button
                                variant="ghost"
                                className="w-full text-red-600 hover:bg-red-50 hover:text-red-700"
                                onClick={() => void handleDeleteUser(user)}
                              >
                                Delete User
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-6">
                <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                  <h2 className="text-2xl font-bold text-gray-900">Create Fleet Manager</h2>
                  <p className="mt-2 text-sm text-gray-500">
                    Create scoped fleet accounts and bind them to an operator and depot.
                  </p>

                  <form className="mt-5 space-y-3" onSubmit={handleCreateFleetAccount}>
                    <input
                      value={fleetForm.name}
                      onChange={(event) =>
                        setFleetForm((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder="Full name"
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
                      placeholder="Temporary password"
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
                      placeholder="Operator"
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
                      placeholder="Depot"
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3"
                    />

                    <Button variant="primary" className="w-full" type="submit">
                      Create Fleet Account
                    </Button>
                  </form>
                </section>

                <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <Activity className="h-5 w-5 text-brand" />
                    <h2 className="text-2xl font-bold text-gray-900">System Health</h2>
                  </div>
                  <div className="mt-5 space-y-3 text-sm">
                    <HealthRow label="Backend" value={health?.backend.status ?? "Checking"} />
                    <HealthRow label="Database" value={health?.database.status ?? "Checking"} />
                    <HealthRow
                      label="Transit sync"
                      value={health?.transitSync.status ?? "Checking"}
                      detail={health?.transitSync.message}
                    />
                    <HealthRow
                      label="WebSocket"
                      value={health?.realtime.websocketStatus ?? "Checking"}
                    />
                    <HealthRow
                      label="AI service"
                      value={health?.ai.status ?? "Checking"}
                      detail={health?.ai.model}
                    />
                  </div>
                </section>
              </div>
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-bold text-gray-900">Audit Log</h2>
              <p className="mt-2 text-sm text-gray-500">
                Recent system changes, role updates, password resets, and transit sync events.
              </p>

              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-[0.14em] text-gray-500">
                      <th className="px-3 py-3">When</th>
                      <th className="px-3 py-3">Actor</th>
                      <th className="px-3 py-3">Action</th>
                      <th className="px-3 py-3">Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="px-3 py-3 text-gray-500">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          {log.actorEmail || "System"}
                        </td>
                        <td className="px-3 py-3 font-medium text-gray-900">{log.action}</td>
                        <td className="px-3 py-3 text-gray-600">{log.summary || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </main>
      </div>
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
