"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AppLocale, messages } from "./messages";

const STORAGE_KEY = "busbuddy.locale.v1";

type LanguageContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function getValueByPath(source: Record<string, any>, path: string) {
  return path.split(".").reduce<any>((currentValue, segment) => currentValue?.[segment], source);
}

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>("en");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedLocale = window.localStorage.getItem(STORAGE_KEY);

    if (storedLocale === "en" || storedLocale === "th") {
      setLocaleState(storedLocale);
      return;
    }

    const browserLocale = window.navigator.language.toLowerCase();
    setLocaleState(browserLocale.startsWith("th") ? "th" : "en");
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, locale);
    }

    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale: setLocaleState,
      t: (key, vars) => {
        const localizedValue = getValueByPath(messages[locale], key);
        const fallbackValue = getValueByPath(messages.en, key);
        const resolvedValue =
          typeof localizedValue === "string"
            ? localizedValue
            : typeof fallbackValue === "string"
              ? fallbackValue
              : key;

        return interpolate(resolvedValue, vars);
      },
    }),
    [locale],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }

  return context;
}
