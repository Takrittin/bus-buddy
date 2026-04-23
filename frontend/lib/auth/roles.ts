import { UserRole } from "@/types/auth";
import { AppLocale } from "@/lib/i18n/messages";

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

export function canAccessAdmin(role?: UserRole | null) {
  return role === "ADMIN";
}

export function isFleetManager(role?: UserRole | null) {
  return role === "FLEET";
}

export function formatUserRole(role?: UserRole | null, locale: AppLocale = "en") {
  switch (role) {
    case "ADMIN":
      return locale === "th" ? "แอดมิน" : "Admin";
    case "FLEET":
      return locale === "th" ? "ผู้จัดการฟลีท" : "Fleet Manager";
    case "USER":
    default:
      return locale === "th" ? "ผู้ใช้" : "User";
  }
}
