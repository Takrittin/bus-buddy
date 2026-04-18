"use client";

"use client";

import React from "react";
import { Bus } from "@/types/bus";
import { Activity, Gauge, Info, Route, User, Users, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface BusDetailSheetProps {
  bus: Bus;
  onClose: () => void;
}

function toDisplayLabel(value: string | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  return value.replace(/_/g, " ");
}

function formatUpdatedTime(value: string, locale: string) {
  return new Date(value).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
      <div className="mt-0.5 text-brand">{icon}</div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
          {label}
        </p>
        <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export function BusDetailSheet({ bus, onClose }: BusDetailSheetProps) {
  const { t, locale } = useLanguage();
  const routeLabel = bus.routeNumber ?? bus.routeId;
  const speedLabel =
    typeof bus.speed === "number" ? `${Math.round(bus.speed)} km/h` : t("common.notAvailable");
  const capacityLabel =
    typeof bus.capacity === "number" ? t("bus.passengers", { count: bus.capacity }) : t("common.notAvailable");
  const nextStopLabel = bus.nextStopName ?? bus.nextStopId ?? t("common.notAvailable");

  return (
    <div className="fixed md:absolute inset-x-0 bottom-0 md:inset-auto md:top-4 md:right-4 md:w-[400px] z-50 p-4 md:p-0 transition-transform">
      <div className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={onClose} />

      <div className="relative z-50 flex max-h-[80vh] w-full flex-col rounded-3xl border border-gray-100 bg-white px-6 pb-8 pt-3 shadow-2xl md:h-[560px] md:max-h-[calc(100vh-100px)] md:rounded-2xl md:shadow-xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-gray-200 md:hidden" />

        <div className="mb-6 flex items-start justify-between md:mt-4">
          <div>
            <div className="inline-flex items-center rounded-full bg-brand px-3 py-1 text-sm font-semibold text-white shadow-sm">
              {t("bus.routePill", { value: routeLabel })}
            </div>
            <h2 className="mt-3 text-2xl font-bold leading-tight text-gray-900">
              {t("bus.bus", { value: bus.vehicleNumber ?? bus.id })}
            </h2>
            <p className="mt-1 text-sm font-medium text-brand">
              {t("bus.liveVehicleDetails")}
            </p>
            <p className="mt-2 text-xs text-gray-500">
              {t("common.updatedAt", { time: formatUpdatedTime(bus.lastUpdated, locale === "th" ? "th-TH" : "en-US") })}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="ml-4 h-8 w-8 flex-shrink-0 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-blue-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
              {t("common.status")}
            </p>
            <p className="mt-1 text-base font-bold capitalize text-blue-950">
              {toDisplayLabel(bus.status, t("common.notAvailable"))}
            </p>
          </div>
          <div className="rounded-2xl bg-orange-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-orange-700">
              {t("common.occupancy")}
            </p>
            <p className="mt-1 text-base font-bold capitalize text-orange-950">
              {toDisplayLabel(bus.occupancyLevel, t("common.notAvailable"))}
            </p>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto pr-2 -mr-2">
          <DetailRow
            icon={<Info className="h-4 w-4" />}
            label={t("bus.licensePlate")}
            value={bus.licensePlate ?? t("common.notAvailable")}
          />
          <DetailRow
            icon={<User className="h-4 w-4" />}
            label={t("bus.driver")}
            value={bus.driverName ?? t("common.notAvailable")}
          />
          <DetailRow
            icon={<Users className="h-4 w-4" />}
            label={t("bus.capacity")}
            value={capacityLabel}
          />
          <DetailRow
            icon={<Route className="h-4 w-4" />}
            label={t("bus.nextStop")}
            value={nextStopLabel}
          />
          <DetailRow
            icon={<Gauge className="h-4 w-4" />}
            label={t("bus.speed")}
            value={speedLabel}
          />
          <DetailRow
            icon={<Activity className="h-4 w-4" />}
            label={t("bus.direction")}
            value={toDisplayLabel(bus.direction, t("common.notAvailable"))}
          />
        </div>
      </div>
    </div>
  );
}
