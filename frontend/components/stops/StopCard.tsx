import React from "react";
import { Stop } from "@/types/bus";
import { MapPin } from "lucide-react";
import { FavoriteButton } from "@/components/ui/FavoriteButton";

interface StopCardProps {
  stop: Stop;
  onClick: (stop: Stop) => void;
  isNearest?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (isFavorite: boolean) => Promise<void>;
}

function getDistanceLabel(distance?: number) {
  if (distance === undefined) {
    return null;
  }

  if (distance <= 50) {
    return "Near you";
  }

  return `${distance}m away`;
}

export function StopCard({
  stop,
  onClick,
  isNearest = false,
  isFavorite = false,
  onToggleFavorite,
}: StopCardProps) {
  const distanceLabel = getDistanceLabel(stop.distance);

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
                  Nearest
                </span>
              ) : null}
            </div>
            {distanceLabel ? <p className="text-xs text-gray-500 mt-1">{distanceLabel}</p> : null}
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
