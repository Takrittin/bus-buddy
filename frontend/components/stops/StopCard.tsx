"use client";

import React from "react";
import { Stop } from "@/types/bus";
import { StopCrowdingRecord } from "@/types/insights";
import { MapPin, UsersRound } from "lucide-react";
import { FavoriteButton } from "@/components/ui/FavoriteButton";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface StopCardProps {
  stop: Stop;
  onClick: (stop: Stop) => void;
  isNearest?: boolean;
  isFavorite?: boolean;
  crowding?: StopCrowdingRecord;
  onToggleFavorite?: (isFavorite: boolean) => Promise<void>;
}

function getDistanceLabel(distance: number | undefined, t: (key: string, vars?: Record<string, string | number>) => string) {
  if (distance === undefined) {
    return null;
  }

  if (distance <= 50) {
    return t("common.nearYou");
  }

  return t("common.metersAway", { distance });
}

function formatCrowdingLabel(
  level: StopCrowdingRecord["crowdingLevel"],
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  switch (level) {
    case "very_crowded":
      return t("home.veryCrowded");
    case "crowded":
      return t("home.crowded");
    case "moderate":
      return t("home.moderateCrowding");
    case "comfortable":
    default:
      return t("home.comfortable");
  }
}

function getCrowdingStyle(level: StopCrowdingRecord["crowdingLevel"]) {
  switch (level) {
    case "very_crowded":
      return "border-red-200 bg-red-50 text-red-700";
    case "crowded":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "moderate":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "comfortable":
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
}

export function StopCard({
  stop,
  onClick,
  isNearest = false,
  isFavorite = false,
  crowding,
  onToggleFavorite,
}: StopCardProps) {
  const { t } = useLanguage();
  const distanceLabel = getDistanceLabel(stop.distance, t);

  return (
    <div
      onClick={() => onClick(stop)}
      className="flex flex-col p-4 bg-white rounded-2xl shadow-sm border border-gray-100 cursor-pointer active:scale-[0.98] transition-transform"
    >
      <div className="flex justify-between items-start">
        <div className="flex gap-3">
          <div className="mt-1 flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-orange-100 text-brand">
            <MapPin className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 leading-tight">{stop.name}</h3>
              {isNearest ? (
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand">
                  {t("common.nearest")}
                </span>
              ) : null}
            </div>
            {distanceLabel ? <p className="text-xs text-gray-500 mt-1">{distanceLabel}</p> : null}
            {crowding ? (
              <div
                className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getCrowdingStyle(
                  crowding.crowdingLevel,
                )}`}
              >
                <UsersRound className="h-3.5 w-3.5" />
                <span>{formatCrowdingLabel(crowding.crowdingLevel, t)}</span>
                <span className="text-current/70">{crowding.crowdingScore}%</span>
              </div>
            ) : null}
          </div>
        </div>
        {onToggleFavorite && (
          <FavoriteButton
            isFavorite={isFavorite}
            onToggle={onToggleFavorite}
          />
        )}
      </div>
    </div>
  );
}
