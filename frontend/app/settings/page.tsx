"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/navigation/AppHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/auth/useAuth";
import { canAccessFleet, formatUserRole } from "@/lib/auth/roles";
import { UserRole } from "@/types/auth";
import { BusFront, LogIn, LogOut, Settings, Shield, UserPlus } from "lucide-react";

type AuthMode = "login" | "register";
const REGISTERABLE_ROLES: UserRole[] = ["USER", "FLEET", "ADMIN"];

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "register" ? "register" : "login";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("USER");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, isAuthenticated, isLoading, login, logout, register } = useAuth();
  const roleLabel = formatUserRole(user?.role);
  const showFleetShortcut = canAccessFleet(user?.role);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const resetForm = () => {
    setName("");
    setEmail("");
    setPassword("");
    setRole("USER");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (mode === "login") {
        await login({ email, password });
      } else {
        await register({
          email,
          password,
          name: name.trim() || undefined,
          role,
        });
      }

      resetForm();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to complete authentication.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col overflow-hidden bg-gray-50">
      <AppHeader />

      <div className="flex flex-1 pt-[60px]">
        <BottomNav />

        <main className="flex-1 w-full overflow-y-auto pb-24 md:pb-8 md:pl-20">
          <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pt-6 md:px-8">
            <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-orange-100 p-3 text-brand">
                  <Settings className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Guests can browse the app, but favorites and alerts need an account.
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
              {isLoading ? (
                <p className="text-sm text-gray-500">Loading account...</p>
              ) : isAuthenticated && user ? (
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">
                      Account
                    </p>
                    <h3 className="mt-2 text-2xl font-bold text-gray-900">
                      {user.name ?? "BusBuddy User"}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">{user.email}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-brand">
                      <Shield className="mr-1.5 h-3.5 w-3.5" />
                      {roleLabel}
                    </span>
                    {showFleetShortcut ? (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-blue-800">
                        Fleet access enabled
                      </span>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800">
                    Favorites and alert subscriptions are enabled for this account.
                  </div>

                  <div className="flex flex-col gap-3 md:flex-row">
                    {showFleetShortcut ? (
                      <Button
                        variant="primary"
                        onClick={() => router.push("/fleet")}
                        className="w-full md:w-auto"
                      >
                        <BusFront className="mr-2 h-4 w-4" />
                        Open Fleet Manager
                      </Button>
                    ) : null}

                    <Button variant="outline" onClick={logout} className="w-full md:w-auto">
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex gap-2 rounded-2xl bg-gray-100 p-1">
                    <button
                      type="button"
                      onClick={() => setMode("login")}
                      className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                        mode === "login"
                          ? "bg-white text-brand shadow-sm"
                          : "text-gray-500"
                      }`}
                    >
                      Login
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("register")}
                      className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                        mode === "register"
                          ? "bg-white text-brand shadow-sm"
                          : "text-gray-500"
                      }`}
                    >
                      Register
                    </button>
                  </div>

                  <form className="space-y-4" onSubmit={handleSubmit}>
                    {mode === "register" ? (
                      <>
                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-gray-700">
                            Name
                          </span>
                          <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none transition-colors focus:border-brand"
                            placeholder="Your name"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-gray-700">
                            Account Type
                          </span>
                          <select
                            value={role}
                            onChange={(event) => setRole(event.target.value as UserRole)}
                            className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none transition-colors focus:border-brand"
                          >
                            {REGISTERABLE_ROLES.map((registerableRole) => (
                              <option key={registerableRole} value={registerableRole}>
                                {formatUserRole(registerableRole)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    ) : null}

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">
                        Email
                      </span>
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                        className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none transition-colors focus:border-brand"
                        placeholder="you@example.com"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">
                        Password
                      </span>
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        minLength={8}
                        className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none transition-colors focus:border-brand"
                        placeholder="Minimum 8 characters"
                      />
                    </label>

                    {error ? (
                      <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                      </div>
                    ) : null}

                    <Button type="submit" isLoading={isSubmitting} className="w-full">
                      {mode === "login" ? (
                        <>
                          <LogIn className="mr-2 h-4 w-4" />
                          Sign In
                        </>
                      ) : (
                        <>
                          <UserPlus className="mr-2 h-4 w-4" />
                          Create Account
                        </>
                      )}
                    </Button>
                  </form>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
