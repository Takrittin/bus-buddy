"use client";

import React, { useState } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/Button";

interface FavoriteButtonProps {
  isFavorite: boolean;
  onToggle: (isFavorite: boolean) => Promise<void>;
  className?: string;
}

export function FavoriteButton({ isFavorite, onToggle, className }: FavoriteButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent parent clicks if any
    setIsLoading(true);
    try {
      await onToggle(!isFavorite);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      isLoading={isLoading}
      onClick={handleToggle}
      className={cn("rounded-full hover:bg-red-50", className)}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
    >
      <Heart
        className={cn("h-5 w-5", isFavorite ? "fill-red-500 text-red-500" : "text-gray-400")}
      />
    </Button>
  );
}
