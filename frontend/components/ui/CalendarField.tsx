"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/Button";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type CalendarFieldMode = "date" | "datetime";

function parseDateValue(value: string, mode: CalendarFieldMode) {
  if (!value) {
    return null;
  }

  if (mode === "date") {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) {
      return null;
    }
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  const [datePart, timePart = "00:00"] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = timePart.split(":").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0);
}

function toDateValue(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function toDateTimeValue(date: Date) {
  return `${toDateValue(date)}T${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function buildCalendarDays(viewDate: Date) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const startDate = new Date(year, month, 1 - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    return {
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      date,
      isCurrentMonth: date.getMonth() === month,
    };
  });
}

function formatValueForButton(
  value: string,
  mode: CalendarFieldMode,
  locale: "en" | "th",
) {
  const date = parseDateValue(value, mode);

  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(mode === "datetime"
      ? {
          hour: "2-digit" as const,
          minute: "2-digit" as const,
        }
      : {}),
  }).format(date);
}

export function CalendarField({
  label,
  value,
  onChange,
  mode = "date",
  required = false,
  placeholder,
  clearable = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mode?: CalendarFieldMode;
  required?: boolean;
  placeholder: string;
  clearable?: boolean;
}) {
  const { locale, t } = useLanguage();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const selectedDate = parseDateValue(value, mode);
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState<Date>(selectedDate ?? new Date());
  const [draftHours, setDraftHours] = useState(
    String(selectedDate?.getHours() ?? 8).padStart(2, "0"),
  );
  const [draftMinutes, setDraftMinutes] = useState(
    String(selectedDate?.getMinutes() ?? 0).padStart(2, "0"),
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleOutsideClick(event: MouseEvent) {
      if (wrapperRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsOpen(false);
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  useEffect(() => {
    if (!selectedDate) {
      return;
    }

    setViewDate(selectedDate);
    setDraftHours(String(selectedDate.getHours()).padStart(2, "0"));
    setDraftMinutes(String(selectedDate.getMinutes()).padStart(2, "0"));
  }, [value, selectedDate]);

  const weekdayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
        weekday: "short",
      }),
    [locale],
  );

  const monthFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
        month: "long",
        year: "numeric",
      }),
    [locale],
  );

  const calendarDays = useMemo(() => buildCalendarDays(viewDate), [viewDate]);
  const weekdayLabels = useMemo(() => {
    const start = new Date(2026, 3, 19);
    return Array.from({ length: 7 }, (_, index) => {
      const next = new Date(start);
      next.setDate(start.getDate() + index);
      return weekdayFormatter.format(next);
    });
  }, [weekdayFormatter]);

  const displayValue = formatValueForButton(value, mode, locale);

  const commitDate = (date: Date) => {
    if (mode === "date") {
      onChange(toDateValue(date));
      setIsOpen(false);
      return;
    }

    const next = new Date(date);
    next.setHours(Number(draftHours), Number(draftMinutes), 0, 0);
    onChange(toDateTimeValue(next));
  };

  const selectedDayKey = selectedDate
    ? `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`
    : null;

  return (
    <div ref={wrapperRef} className="relative">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
        {label}
      </span>

      <button
        type="button"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className={cn(
          "flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left text-sm text-gray-900 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand",
          !displayValue && "text-gray-400",
          isOpen && "border-brand shadow-lg shadow-orange-100",
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="rounded-xl bg-orange-50 p-2 text-brand">
            <CalendarDays className="h-4 w-4" />
          </span>
          <span className="truncate">{displayValue || placeholder}</span>
        </span>
        <ChevronRight className={cn("h-4 w-4 text-gray-400 transition-transform", isOpen && "rotate-90")} />
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-[calc(100%+10px)] z-30 w-[min(320px,calc(100vw-2rem))] rounded-3xl border border-orange-100 bg-white p-4 shadow-2xl shadow-orange-100 sm:w-full sm:min-w-[320px]">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() =>
                setViewDate(
                  new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1),
                )
              }
              className="rounded-xl border border-gray-200 p-2 text-gray-600 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-brand"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-semibold text-gray-900">
              {monthFormatter.format(viewDate)}
            </div>
            <button
              type="button"
              onClick={() =>
                setViewDate(
                  new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1),
                )
              }
              className="rounded-xl border border-gray-200 p-2 text-gray-600 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-brand"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">
            {weekdayLabels.map((weekday) => (
              <div key={weekday} className="py-2">
                {weekday}
              </div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const dayKey = `${day.date.getFullYear()}-${day.date.getMonth()}-${day.date.getDate()}`;
              const isSelected = selectedDayKey === dayKey;
              const isToday = dayKey === `${new Date().getFullYear()}-${new Date().getMonth()}-${new Date().getDate()}`;

              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => commitDate(day.date)}
                  className={cn(
                    "rounded-2xl px-0 py-2.5 text-sm transition-colors",
                    day.isCurrentMonth
                      ? "text-gray-900 hover:bg-orange-50"
                      : "text-gray-300 hover:bg-gray-50",
                    isSelected && "bg-brand font-semibold text-white hover:bg-brand",
                    isToday && !isSelected && "border border-orange-200 bg-orange-50 text-brand",
                  )}
                >
                  {day.date.getDate()}
                </button>
              );
            })}
          </div>

          {mode === "datetime" ? (
            <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                <Clock3 className="h-4 w-4" />
                {t("common.time")}
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <select
                  value={draftHours}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setDraftHours(nextValue);
                    if (selectedDate) {
                      const next = new Date(selectedDate);
                      next.setHours(Number(nextValue), Number(draftMinutes), 0, 0);
                      onChange(toDateTimeValue(next));
                    }
                  }}
                  className="rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 outline-none transition-colors focus:border-brand"
                >
                  {Array.from({ length: 24 }, (_, hour) => {
                    const option = String(hour).padStart(2, "0");
                    return (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    );
                  })}
                </select>
                <span className="text-sm font-semibold text-gray-400">:</span>
                <select
                  value={draftMinutes}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setDraftMinutes(nextValue);
                    if (selectedDate) {
                      const next = new Date(selectedDate);
                      next.setHours(Number(draftHours), Number(nextValue), 0, 0);
                      onChange(toDateTimeValue(next));
                    }
                  }}
                  className="rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 outline-none transition-colors focus:border-brand"
                >
                  {["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"].map(
                    (minute) => (
                      <option key={minute} value={minute}>
                        {minute}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex gap-2">
              {clearable ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onChange("");
                    setIsOpen(false);
                  }}
                >
                  {t("common.clear")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const now = new Date();
                  if (mode === "date") {
                    onChange(toDateValue(now));
                    setIsOpen(false);
                    return;
                  }
                  setDraftHours(String(now.getHours()).padStart(2, "0"));
                  setDraftMinutes(String(now.getMinutes()).padStart(2, "0"));
                  onChange(toDateTimeValue(now));
                }}
              >
                {t("common.today")}
              </Button>
            </div>
            <Button type="button" variant="primary" size="sm" onClick={() => setIsOpen(false)}>
              {t("common.done")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
