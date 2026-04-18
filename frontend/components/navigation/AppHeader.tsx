"use client";

import React from "react";
import { BusFront, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export function AppHeader() {
  const { t } = useLanguage();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-md border-b border-gray-100 px-4 py-3 h-[60px] flex items-center justify-between shadow-sm">
      <div className="flex items-center justify-between w-full max-w-[1920px] mx-auto">
        <div className="flex items-center gap-2 text-brand">
          <BusFront className="h-7 w-7" />
          <h1 className="text-xl font-bold tracking-tight">BusBuddy</h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-gray-500 rounded-full h-10 w-10 hover:bg-gray-100"
          aria-label={t("common.search")}
          title={t("common.search")}
        >
          <Search className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
