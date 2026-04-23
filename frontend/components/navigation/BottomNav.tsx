"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BusFront, Map, Heart, Settings, Bell, Shield } from "lucide-react";
import { cn } from "@/components/ui/Button";
import { useAuth } from "@/hooks/auth/useAuth";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export function BottomNav() {
  const pathname = usePathname();
  const { canAccessFleet, canUseRiderTools, isAdmin, isLoading, isFleetManager } = useAuth();
  const { t } = useLanguage();
  const riderTabs = [
    { name: t("nav.map"), href: "/", icon: Map },
    { name: t("nav.favorites"), href: "/favorites", icon: Heart },
    { name: t("nav.alerts"), href: "/alerts", icon: Bell },
    { name: t("nav.settings"), href: "/settings", icon: Settings },
  ];
  const fleetTab = { name: t("nav.fleet"), href: "/fleet", icon: BusFront };
  const adminTab = { name: t("nav.admin"), href: "/admin", icon: Shield };
  const fleetTabs = [
    { name: t("nav.map"), href: "/", icon: Map },
    fleetTab,
    { name: t("nav.settings"), href: "/settings", icon: Settings },
  ];
  const adminTabs = [
    adminTab,
    { name: t("nav.settings"), href: "/settings", icon: Settings },
  ];

  const tabs = isLoading
    ? riderTabs
    : isFleetManager
      ? fleetTabs
      : isAdmin
        ? adminTabs
        : canAccessFleet && canUseRiderTools
          ? [...riderTabs, fleetTab]
        : riderTabs;

  return (
    <>
      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around bg-white pb-safe pt-2 border-t border-gray-100 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.href;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 p-2 transition-colors",
                isActive ? "text-brand" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <Icon className="h-6 w-6" strokeWidth={isActive ? 2.5 : 2} />
              <span className={cn("text-[10px] font-medium", isActive && "font-bold")}>
                {tab.name}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Desktop/Tablet Side Rail Navigation */}
      <nav className="hidden md:flex fixed left-0 top-[60px] bottom-0 w-20 flex-col items-center justify-start bg-white border-r border-gray-100 shadow-sm z-40 py-6 gap-8">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.href;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-1 p-2 w-full transition-colors",
                isActive ? "text-brand" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-xl"
              )}
            >
              <Icon className="h-7 w-7" strokeWidth={isActive ? 2.5 : 2} />
              <span className={cn("text-xs font-medium mt-1", isActive && "font-bold")}>
                {tab.name}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
