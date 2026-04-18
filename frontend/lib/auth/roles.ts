import { UserRole } from "@/types/auth";

const FLEET_ACCESS_ROLES = new Set<UserRole>(["ADMIN", "FLEET"]);
const RIDER_TOOL_ROLES = new Set<UserRole>(["USER", "ADMIN"]);

export function canAccessFleet(role?: UserRole | null) {
  if (!role) {
    return false;
  }

  return FLEET_ACCESS_ROLES.has(role);
}

export function canUseRiderTools(role?: UserRole | null) {
  if (!role) {
    return false;
  }

  return RIDER_TOOL_ROLES.has(role);
}

export function isFleetManager(role?: UserRole | null) {
  return role === "FLEET";
}

export function formatUserRole(role?: UserRole | null) {
  switch (role) {
    case "ADMIN":
      return "Admin";
    case "FLEET":
      return "Fleet Manager";
    case "USER":
    default:
      return "User";
  }
}
