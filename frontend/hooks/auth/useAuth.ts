import { useSession } from "@/lib/auth/AuthContext";
import { canAccessFleet, canUseRiderTools, isFleetManager } from "@/lib/auth/roles";

export function useAuth() {
  const { session, status, login, register, logout } = useSession();
  const role = session?.user?.role ?? null;

  return {
    user: session?.user ?? null,
    role,
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading",
    isGuest: session?.user?.isGuest ?? status !== "authenticated",
    canAccessFleet: canAccessFleet(role),
    canUseRiderTools: canUseRiderTools(role),
    isFleetManager: isFleetManager(role),
    isAdmin: role === "ADMIN",
    login,
    register,
    logout,
  };
}
