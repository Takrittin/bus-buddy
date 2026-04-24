"use client";

import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BellRing,
  BusFront,
  CalendarRange,
  ChevronRight,
  ClipboardList,
  Gauge,
  MapPinned,
  PenSquare,
  Search,
  ShieldAlert,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { AppHeader } from "@/components/navigation/AppHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { BusDetailSheet } from "@/components/buses/BusDetailSheet";
import { FleetAssistantPanel } from "@/components/ai/FleetAssistantPanel";
import { Button } from "@/components/ui/Button";
import { CalendarField } from "@/components/ui/CalendarField";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/hooks/auth/useAuth";
import { useFleetOperations } from "@/hooks/useFleetOperations";
import { useLiveBuses } from "@/hooks/useLiveBuses";
import { useRoutes } from "@/hooks/useRoutes";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { formatUserRole } from "@/lib/auth/roles";
import { getFleetDispatchBoard } from "@/services/insights";
import { Bus, BusStatus, Direction, Route, TrafficLevel } from "@/types/bus";
import { DriverShift, ShiftStatus } from "@/types/fleet";
import { FleetDispatchRecord } from "@/types/insights";

type AlertTone = "red" | "orange" | "blue";
type AlertSeverity = 1 | 2 | 3 | 4;
type FleetTab = "overview" | "alerts" | "vehicles" | "shifts";

const SHIFT_PAGE_SIZE = 50;

interface ShiftFormState {
  driverId: string;
  busId: string;
  routeId: string;
  direction: Direction;
  shiftStartAt: string;
  shiftEndAt: string;
  status: "SCHEDULED" | "ACTIVE";
  notes: string;
}

interface FleetAlertItem {
  id: string;
  busId: string;
  routeId: string;
  routeNumber: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  tone: AlertTone;
}

function formatBusStatus(value: string | undefined, t: (key: string) => string) {
  switch (value) {
    case "delayed":
      return t("fleet.delayed");
    case "near_stop":
      return t("fleet.nearStop");
    case "at_stop":
      return t("fleet.atStop");
    case "out_of_service":
      return t("fleet.outOfService");
    case "running":
    default:
      return t("fleet.running");
  }
}

function formatDirection(value: Direction | undefined, t: (key: string) => string) {
  return value === "inbound" ? t("fleet.inbound") : t("fleet.outbound");
}

function formatTraffic(value: TrafficLevel | undefined, t: (key: string) => string) {
  switch (value) {
    case "light":
      return t("fleet.light");
    case "heavy":
      return t("fleet.heavy");
    case "severe":
      return t("fleet.severe");
    case "moderate":
    default:
      return t("fleet.moderate");
  }
}

function formatUpdatedTime(value: string, t: (key: string, vars?: Record<string, string | number>) => string) {
  const elapsedSeconds = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 1000),
  );

  if (elapsedSeconds < 10) {
    return t("fleet.justNow");
  }

  if (elapsedSeconds < 60) {
    return t("fleet.secondsAgo", { count: elapsedSeconds });
  }

  const elapsedMinutes = Math.round(elapsedSeconds / 60);

  if (elapsedMinutes < 60) {
    return t("fleet.minutesAgo", { count: elapsedMinutes });
  }

  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateTimeLocalValue(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const offset = date.getTimezoneOffset();
  const normalizedDate = new Date(date.getTime() - offset * 60 * 1000);
  return normalizedDate.toISOString().slice(0, 16);
}

function createDefaultShiftFormState(): ShiftFormState {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);

  const end = new Date(start);
  end.setHours(end.getHours() + 8);

  return {
    driverId: "",
    busId: "",
    routeId: "",
    direction: "outbound",
    shiftStartAt: toDateTimeLocalValue(start),
    shiftEndAt: toDateTimeLocalValue(end),
    status: "SCHEDULED",
    notes: "",
  };
}

function formatShiftStatus(value: ShiftStatus, t: (key: string) => string) {
  switch (value) {
    case "ACTIVE":
      return t("common.active");
    case "COMPLETED":
      return t("common.completed");
    case "MISSED":
      return t("common.missed");
    case "SCHEDULED":
    default:
      return t("common.scheduled");
  }
}

function getShiftStatusBadgeClass(status: ShiftStatus) {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-100 text-emerald-800";
    case "COMPLETED":
      return "bg-blue-100 text-blue-800";
    case "MISSED":
      return "bg-red-100 text-red-800";
    case "SCHEDULED":
    default:
      return "bg-amber-100 text-amber-800";
  }
}

function formatShiftDateRange(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);

  return `${start.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  })} • ${start.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })} - ${end.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function getStatusBadgeClass(status?: BusStatus) {
  switch (status) {
    case "delayed":
      return "bg-red-100 text-red-800";
    case "out_of_service":
      return "bg-slate-200 text-slate-700";
    case "near_stop":
      return "bg-amber-100 text-amber-800";
    case "at_stop":
      return "bg-blue-100 text-blue-800";
    case "running":
    default:
      return "bg-emerald-100 text-emerald-800";
  }
}

function getTrafficBadgeClass(level?: TrafficLevel) {
  switch (level) {
    case "severe":
      return "bg-red-100 text-red-800";
    case "heavy":
      return "bg-orange-100 text-orange-800";
    case "moderate":
      return "bg-amber-100 text-amber-800";
    case "light":
    default:
      return "bg-sky-100 text-sky-800";
  }
}

function getAlertToneClass(tone: AlertTone) {
  switch (tone) {
    case "red":
      return "border-red-100 bg-red-50 text-red-900";
    case "blue":
      return "border-blue-100 bg-blue-50 text-blue-900";
    case "orange":
    default:
      return "border-orange-100 bg-orange-50 text-orange-900";
  }
}

function getAlertIcon(severity: AlertSeverity) {
  if (severity >= 4) {
    return <ShieldAlert className="h-5 w-5" />;
  }

  if (severity === 3) {
    return <TriangleAlert className="h-5 w-5" />;
  }

  if (severity === 2) {
    return <AlertTriangle className="h-5 w-5" />;
  }

  return <BellRing className="h-5 w-5" />;
}

function FleetStatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "orange" | "blue" | "red" | "green";
}) {
  const tones = {
    orange: "bg-orange-50 text-orange-900 border-orange-100",
    blue: "bg-blue-50 text-blue-900 border-blue-100",
    red: "bg-red-50 text-red-900 border-red-100",
    green: "bg-green-50 text-green-900 border-green-100",
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-sm md:rounded-3xl md:p-5 ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <div className="rounded-2xl bg-white/70 p-3">{icon}</div>
        <p className="text-2xl font-black tracking-tight md:text-3xl">{value}</p>
      </div>
      <p className="mt-4 text-sm font-semibold uppercase tracking-[0.12em]">{label}</p>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-colors focus:border-brand"
      >
        {children}
      </select>
    </label>
  );
}

function FleetTabButton({
  label,
  value,
  activeTab,
  onClick,
  count,
}: {
  label: string;
  value: FleetTab;
  activeTab: FleetTab;
  onClick: (value: FleetTab) => void;
  count?: number;
}) {
  const isActive = activeTab === value;

  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${
        isActive
          ? "bg-brand text-white shadow-lg shadow-brand/20"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      <span>{label}</span>
      {typeof count === "number" ? (
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            isActive ? "bg-white/20 text-white" : "bg-white text-gray-500"
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function buildFleetAlerts(
  buses: Bus[],
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  const alerts = buses.flatMap<FleetAlertItem>((bus) => {
    const routeNumber = bus.routeNumber ?? bus.routeId;
    const busLabel = bus.licensePlate ?? bus.vehicleNumber ?? bus.id;
    const items: FleetAlertItem[] = [];

    if (bus.status === "out_of_service") {
      items.push({
        id: `${bus.id}-out_of_service`,
        busId: bus.id,
        routeId: bus.routeId,
        routeNumber,
        title: `${t("bus.bus", { value: busLabel })} ${t("fleet.outOfService").toLowerCase()}`,
        description: `${t("common.route")} ${routeNumber} ${t("fleet.outOfService").toLowerCase()}.`,
        severity: 4,
        tone: "red",
      });
    }

    if (bus.status === "delayed") {
      items.push({
        id: `${bus.id}-delayed`,
        busId: bus.id,
        routeId: bus.routeId,
        routeNumber,
        title: `${t("common.route")} ${routeNumber} ${t("fleet.delayed").toLowerCase()}`,
        description: `${busLabel} ${t("fleet.delayed").toLowerCase()} near ${bus.nextStopName ?? t("common.nextStop").toLowerCase()}.`,
        severity: 3,
        tone: "orange",
      });
    }

    if (bus.trafficLevel === "severe") {
      items.push({
        id: `${bus.id}-severe-traffic`,
        busId: bus.id,
        routeId: bus.routeId,
        routeNumber,
        title: `${t("fleet.severe")} ${t("fleet.trafficSuffix", { level: "" }).trim()} ${t("common.route")} ${routeNumber}`,
        description: `${busLabel} is moving through a high-congestion corridor.`,
        severity: 3,
        tone: "red",
      });
    }

    if (bus.occupancyLevel === "full") {
      items.push({
        id: `${bus.id}-full`,
        busId: bus.id,
        routeId: bus.routeId,
        routeNumber,
        title: `${t("bus.bus", { value: busLabel })} ${t("common.capacity").toLowerCase()} full`,
        description: `Passengers may need dispatch support on ${t("common.route")} ${routeNumber}.`,
        severity: 2,
        tone: "blue",
      });
    }

    if ((bus.etaToNextStopMinutes ?? 0) >= 10 && bus.status === "near_stop") {
      items.push({
        id: `${bus.id}-slow-approach`,
        busId: bus.id,
        routeId: bus.routeId,
        routeNumber,
        title: `Slow approach to ${bus.nextStopName ?? t("common.nextStop").toLowerCase()}`,
        description: `${busLabel} is taking longer than expected to reach the next stop.`,
        severity: 1,
        tone: "orange",
      });
    }

    return items;
  });

  return alerts
    .sort((left, right) => right.severity - left.severity)
    .slice(0, 10);
}

function buildRouteHealth(routes: Route[], buses: Bus[]) {
  const busesByRoute = new Map<string, Bus[]>();

  buses.forEach((bus) => {
    const routeBuses = busesByRoute.get(bus.routeId) ?? [];
    routeBuses.push(bus);
    busesByRoute.set(bus.routeId, routeBuses);
  });

  return routes
    .map((route) => {
      const activeStatuses = Object.values(route.currentStatus ?? {}).filter(Boolean);
      const delayMinutes =
        activeStatuses.length === 0
          ? 0
          : Math.max(...activeStatuses.map((status) => status?.averageDelayMinutes ?? 0));
      const averageSpeed =
        activeStatuses.length === 0
          ? 0
          : Math.round(
              activeStatuses.reduce(
                (total, status) => total + (status?.averageSpeedKmh ?? 0),
                0,
              ) / activeStatuses.length,
            );
      const routeBuses = busesByRoute.get(route.id) ?? [];
      const delayedCount = routeBuses.filter((bus) => bus.status === "delayed").length;

      return {
        id: route.id,
        routeNumber: route.routeNumber,
        routeName: route.routeName,
        delayMinutes,
        averageSpeed,
        delayedCount,
        liveBuses: routeBuses.length,
      };
    })
    .sort((left, right) => {
      if (right.delayMinutes === left.delayMinutes) {
        return right.delayedCount - left.delayedCount;
      }

      return right.delayMinutes - left.delayMinutes;
    })
    .slice(0, 6);
}

export default function FleetPage() {
  const router = useRouter();
  const { locale, t } = useLanguage();
  const { user, isAuthenticated, isLoading: isAuthLoading, canAccessFleet, isAdmin } = useAuth();
  const { buses, isLoading: isLoadingBuses } = useLiveBuses();
  const { routes, isLoading: isLoadingRoutes } = useRoutes();
  const canUseFleetPage = canAccessFleet && !isAdmin;
  const {
    drivers,
    fleetBuses,
    shifts,
    isLoading: isLoadingFleetOperations,
    error: fleetOperationsError,
    createShift,
    updateShift,
    closeShift,
  } = useFleetOperations(isAuthenticated && canUseFleetPage);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState<"all" | BusStatus>("all");
  const [selectedDirection, setSelectedDirection] = useState<"all" | Direction>("all");
  const [selectedTraffic, setSelectedTraffic] = useState<"all" | TrafficLevel>("all");
  const [activeTab, setActiveTab] = useState<FleetTab>("overview");
  const [shiftForm, setShiftForm] = useState<ShiftFormState>(createDefaultShiftFormState);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [isShiftFormOpen, setIsShiftFormOpen] = useState(false);
  const [isSubmittingShift, setIsSubmittingShift] = useState(false);
  const [shiftActionError, setShiftActionError] = useState<string | null>(null);
  const [shiftActionSuccess, setShiftActionSuccess] = useState<string | null>(null);
  const [shiftPage, setShiftPage] = useState(1);
  const [shiftSearchQuery, setShiftSearchQuery] = useState("");
  const [shiftDateFrom, setShiftDateFrom] = useState("");
  const [shiftDateTo, setShiftDateTo] = useState("");
  const [dispatchBoard, setDispatchBoard] = useState<FleetDispatchRecord[]>([]);
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());
  const deferredShiftSearchQuery = useDeferredValue(shiftSearchQuery.trim().toLowerCase());
  const STATUS_OPTIONS: Array<{ value: "all" | BusStatus; label: string }> = [
    { value: "all", label: t("fleet.allStatuses") },
    { value: "running", label: t("fleet.running") },
    { value: "delayed", label: t("fleet.delayed") },
    { value: "near_stop", label: t("fleet.nearStop") },
    { value: "at_stop", label: t("fleet.atStop") },
    { value: "out_of_service", label: t("fleet.outOfService") },
  ];
  const DIRECTION_OPTIONS: Array<{ value: "all" | Direction; label: string }> = [
    { value: "all", label: t("fleet.allDirections") },
    { value: "outbound", label: t("fleet.outbound") },
    { value: "inbound", label: t("fleet.inbound") },
  ];
  const TRAFFIC_OPTIONS: Array<{ value: "all" | TrafficLevel; label: string }> = [
    { value: "all", label: t("fleet.allTraffic") },
    { value: "light", label: t("fleet.light") },
    { value: "moderate", label: t("fleet.moderate") },
    { value: "heavy", label: t("fleet.heavy") },
    { value: "severe", label: t("fleet.severe") },
  ];

  const routeOptions = useMemo(
    () =>
      routes
        .map((route) => ({
          id: route.id,
          routeNumber: route.routeNumber,
          routeName: route.routeName,
        }))
        .toSorted((left, right) => left.routeNumber.localeCompare(right.routeNumber)),
    [routes],
  );

  const driverNameCounts = useMemo(() => {
    return drivers.reduce<Record<string, number>>((counts, driver) => {
      counts[driver.fullName] = (counts[driver.fullName] ?? 0) + 1;
      return counts;
    }, {});
  }, [drivers]);

  const driverShiftOptions = useMemo(
    () =>
      drivers.map((driver) => {
        const isDuplicateName = (driverNameCounts[driver.fullName] ?? 0) > 1;
        const disambiguator = driver.depotName ?? driver.employeeCode;

        return {
          id: driver.id,
          label:
            isDuplicateName && disambiguator
              ? `${driver.fullName} • ${disambiguator}`
              : driver.fullName,
        };
      }),
    [driverNameCounts, drivers],
  );

  const selectedDriverForShift = useMemo(
    () => drivers.find((driver) => driver.id === shiftForm.driverId) ?? null,
    [drivers, shiftForm.driverId],
  );

  const selectedFleetBusForShift = useMemo(
    () => fleetBuses.find((bus) => bus.id === shiftForm.busId) ?? null,
    [fleetBuses, shiftForm.busId],
  );

  const selectedRouteForShift = useMemo(
    () => routeOptions.find((route) => route.id === shiftForm.routeId) ?? null,
    [routeOptions, shiftForm.routeId],
  );

  const alerts = useMemo(() => buildFleetAlerts(buses, t), [buses, t]);
  const routeHealth = useMemo(() => buildRouteHealth(routes, buses), [routes, buses]);

  useEffect(() => {
    if (!canUseFleetPage) {
      return;
    }

    let isMounted = true;

    async function loadDispatchBoard() {
      const nextDispatchBoard = await getFleetDispatchBoard();

      if (isMounted) {
        setDispatchBoard(nextDispatchBoard);
      }
    }

    void loadDispatchBoard().catch(() => {
      if (isMounted) {
        setDispatchBoard([]);
      }
    });

    const intervalId = window.setInterval(() => {
      void loadDispatchBoard();
    }, 15000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [canUseFleetPage]);

  const filteredShifts = useMemo(() => {
    return shifts.filter((shift) => {
      if (deferredShiftSearchQuery) {
        const searchableFields = [
          shift.driverName,
          shift.driverId,
          shift.busVehicleNumber,
          shift.busLicensePlate,
          shift.routeNumber,
          shift.routeId,
          shift.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!searchableFields.includes(deferredShiftSearchQuery)) {
          return false;
        }
      }

      const shiftStartTime = new Date(shift.shiftStartAt).getTime();

      if (shiftDateFrom) {
        const fromTime = new Date(`${shiftDateFrom}T00:00:00`).getTime();
        if (shiftStartTime < fromTime) {
          return false;
        }
      }

      if (shiftDateTo) {
        const toTime = new Date(`${shiftDateTo}T23:59:59`).getTime();
        if (shiftStartTime > toTime) {
          return false;
        }
      }

      return true;
    });
  }, [deferredShiftSearchQuery, shiftDateFrom, shiftDateTo, shifts]);
  const hasActiveShiftFilters =
    deferredShiftSearchQuery.length > 0 || Boolean(shiftDateFrom) || Boolean(shiftDateTo);

  const sortedShifts = useMemo(
    () =>
      filteredShifts
        .slice()
        .sort(
          (left, right) =>
            new Date(right.shiftStartAt).getTime() - new Date(left.shiftStartAt).getTime(),
        ),
    [filteredShifts],
  );

  const totalShiftPages = Math.max(1, Math.ceil(sortedShifts.length / SHIFT_PAGE_SIZE));
  const currentShiftPage = Math.min(shiftPage, totalShiftPages);
  const paginatedShifts = useMemo(
    () =>
      sortedShifts.slice(
        (currentShiftPage - 1) * SHIFT_PAGE_SIZE,
        currentShiftPage * SHIFT_PAGE_SIZE,
      ),
    [currentShiftPage, sortedShifts],
  );

  const filteredBuses = useMemo(() => {
    return buses.filter((bus) => {
      if (selectedRouteId !== "all" && bus.routeId !== selectedRouteId) {
        return false;
      }

      if (selectedStatus !== "all" && bus.status !== selectedStatus) {
        return false;
      }

      if (selectedDirection !== "all" && bus.direction !== selectedDirection) {
        return false;
      }

      if (selectedTraffic !== "all" && bus.trafficLevel !== selectedTraffic) {
        return false;
      }

      if (!deferredSearchQuery) {
        return true;
      }

      const searchableFields = [
        bus.routeNumber,
        bus.licensePlate,
        bus.vehicleNumber,
        bus.driverName,
        bus.nextStopName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableFields.includes(deferredSearchQuery);
    });
  }, [
    buses,
    deferredSearchQuery,
    selectedDirection,
    selectedRouteId,
    selectedStatus,
    selectedTraffic,
  ]);

  const selectedBus = useMemo(
    () => buses.find((bus) => bus.id === selectedBusId) ?? null,
    [buses, selectedBusId],
  );

  const shiftStats = useMemo(() => {
    const active = shifts.filter((shift) => shift.status === "ACTIVE").length;
    const scheduled = shifts.filter((shift) => shift.status === "SCHEDULED").length;
    const completed = shifts.filter((shift) => shift.status === "COMPLETED").length;
    const missed = shifts.filter((shift) => shift.status === "MISSED").length;

    return {
      active,
      scheduled,
      completed,
      missed,
    };
  }, [shifts]);

  const dashboardStats = useMemo(() => {
    const activeBuses = buses.filter((bus) => bus.status !== "out_of_service");
    const delayedBuses = buses.filter((bus) => bus.status === "delayed");
    const severeTrafficBuses = buses.filter((bus) => bus.trafficLevel === "severe");
    const fullBuses = buses.filter((bus) => bus.occupancyLevel === "full");
    const averageSpeed =
      activeBuses.length === 0
        ? 0
        : Math.round(
            activeBuses.reduce((total, bus) => total + (bus.speed ?? 0), 0) / activeBuses.length,
          );
    const watchedRoutes = new Set(buses.map((bus) => bus.routeId)).size;

    return {
      activeBuses: activeBuses.length,
      delayedBuses: delayedBuses.length,
      averageSpeed,
      watchedRoutes,
      severeTrafficBuses: severeTrafficBuses.length,
      fullBuses: fullBuses.length,
    };
  }, [buses]);

  const isLoading =
    isAuthLoading ||
    isLoadingBuses ||
    isLoadingRoutes ||
    (isAuthenticated && canUseFleetPage && isLoadingFleetOperations);
  const topAlertsPreview = alerts.slice(0, 3);

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedRouteId("all");
    setSelectedStatus("all");
    setSelectedDirection("all");
    setSelectedTraffic("all");
  };

  const clearShiftFilters = () => {
    setShiftSearchQuery("");
    setShiftDateFrom("");
    setShiftDateTo("");
    setShiftPage(1);
  };

  const resetShiftForm = () => {
    setShiftForm(createDefaultShiftFormState());
    setEditingShiftId(null);
  };

  useEffect(() => {
    if (shiftPage > totalShiftPages) {
      setShiftPage(totalShiftPages);
    }
  }, [shiftPage, totalShiftPages]);

  const startEditingShift = (shift: DriverShift) => {
    setActiveTab("shifts");
    setIsShiftFormOpen(true);
    setEditingShiftId(shift.id);
    setShiftActionError(null);
    setShiftActionSuccess(null);
    setShiftForm({
      driverId: shift.driverId,
      busId: shift.busId,
      routeId: shift.routeId,
      direction: shift.direction,
      shiftStartAt: toDateTimeLocalValue(shift.shiftStartAt),
      shiftEndAt: toDateTimeLocalValue(shift.shiftEndAt),
      status: shift.status === "ACTIVE" ? "ACTIVE" : "SCHEDULED",
      notes: shift.notes ?? "",
    });
  };

  const handleShiftFormChange = <Key extends keyof ShiftFormState>(
    key: Key,
    value: ShiftFormState[Key],
  ) => {
    setShiftForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  };

  const handleShiftSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setIsSubmittingShift(true);
      setShiftActionError(null);
      setShiftActionSuccess(null);

      const payload = {
        driverId: shiftForm.driverId,
        busId: shiftForm.busId,
        routeId: shiftForm.routeId,
        direction: shiftForm.direction,
        shiftStartAt: new Date(shiftForm.shiftStartAt).toISOString(),
        shiftEndAt: new Date(shiftForm.shiftEndAt).toISOString(),
        status: shiftForm.status,
        notes: shiftForm.notes.trim() || undefined,
      } as const;

      if (editingShiftId) {
        await updateShift(editingShiftId, payload);
        resetShiftForm();
        setShiftActionSuccess("Shift updated.");
      } else {
        await createShift(payload);
        resetShiftForm();
        setShiftActionSuccess("Shift assigned.");
        setIsShiftFormOpen(false);
      }
    } catch (error) {
      setShiftActionError(
        error instanceof Error ? error.message : "Unable to save driver shift.",
      );
    } finally {
      setIsSubmittingShift(false);
    }
  };

  const handleCloseShift = async (shift: DriverShift) => {
    const shouldClose = window.confirm(
      `Close shift for ${shift.driverName ?? shift.driverId} on ${shift.busVehicleNumber ?? shift.busId}?`,
    );

    if (!shouldClose) {
      return;
    }

    try {
      setIsSubmittingShift(true);
      setShiftActionError(null);
      setShiftActionSuccess(null);
      await closeShift(shift.id, {
        status: "COMPLETED",
      });
      setShiftActionSuccess("Shift closed.");

      if (editingShiftId === shift.id) {
        resetShiftForm();
      }
    } catch (error) {
      setShiftActionError(
        error instanceof Error ? error.message : "Unable to close driver shift.",
      );
    } finally {
      setIsSubmittingShift(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col overflow-hidden bg-gray-50">
      <AppHeader />

      <div className="flex flex-1 pt-[60px]">
        <BottomNav />

        <main className="flex-1 w-full overflow-y-auto pb-24 md:pb-8 md:pl-20">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-3 pt-4 sm:px-4 md:gap-6 md:px-8 md:pt-6">
            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:rounded-3xl md:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">
                    {t("fleet.operations")}
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-gray-900 md:text-3xl">{t("fleet.title")}</h2>
                  <p className="mt-2 max-w-3xl text-sm text-gray-500">
                    {t("fleet.subtitle")}
                  </p>
                </div>

                {user ? (
                  <div className="rounded-2xl border border-orange-100 bg-orange-50 px-3 py-3 text-sm text-orange-900 md:px-4">
                    {t("fleet.signedInAs")} <span className="font-semibold">{user.name ?? user.email}</span>
                    {" • "}
                    {formatUserRole(user.role, locale)}
                  </div>
                ) : null}
              </div>
            </section>

            {isLoading ? (
              <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:rounded-3xl md:p-6">
                <p className="text-sm text-gray-500">{t("fleet.loading")}</p>
              </section>
            ) : !isAuthenticated ? (
              <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:rounded-3xl md:p-6">
                <EmptyState
                  icon={<ShieldAlert className="h-16 w-16 mx-auto" />}
                  title={t("fleet.signInTitle")}
                  description={t("fleet.signInDescription")}
                  action={
                    <Button variant="primary" onClick={() => router.push("/settings?mode=login")}>
                      {t("common.openSettings")}
                    </Button>
                  }
                />
              </section>
            ) : !canUseFleetPage ? (
              <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:rounded-3xl md:p-6">
                <EmptyState
                  icon={<BusFront className="h-16 w-16 mx-auto" />}
                  title={t("fleet.accessTitle")}
                  description={t("fleet.accessDescription")}
                  action={
                    <Button variant="outline" onClick={() => router.push("/")}>
                      {t("common.backToMap")}
                    </Button>
                  }
                />
              </section>
            ) : (
              <>
                <section className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm md:rounded-3xl md:p-4">
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
                    <FleetTabButton
                      label={t("fleet.overview")}
                      value="overview"
                      activeTab={activeTab}
                      onClick={setActiveTab}
                    />
                    <FleetTabButton
                      label={t("fleet.alerts")}
                      value="alerts"
                      activeTab={activeTab}
                      onClick={setActiveTab}
                      count={alerts.length}
                    />
                    <FleetTabButton
                      label={t("fleet.vehicles")}
                      value="vehicles"
                      activeTab={activeTab}
                      onClick={setActiveTab}
                      count={filteredBuses.length}
                    />
                    <FleetTabButton
                      label={t("fleet.shifts")}
                      value="shifts"
                      activeTab={activeTab}
                      onClick={setActiveTab}
                      count={shifts.length}
                    />
                  </div>
                </section>

                <section className="grid grid-cols-2 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-4">
                  <FleetStatCard
                    icon={<Activity className="h-5 w-5 text-orange-700" />}
                    label={t("fleet.activeBuses")}
                    value={`${dashboardStats.activeBuses}`}
                    tone="orange"
                  />
                  <FleetStatCard
                    icon={<AlertTriangle className="h-5 w-5 text-red-700" />}
                    label={t("fleet.delayedBuses")}
                    value={`${dashboardStats.delayedBuses}`}
                    tone="red"
                  />
                  <FleetStatCard
                    icon={<Gauge className="h-5 w-5 text-blue-700" />}
                    label={t("fleet.averageSpeed")}
                    value={`${dashboardStats.averageSpeed} km/h`}
                    tone="blue"
                  />
                  <FleetStatCard
                    icon={<MapPinned className="h-5 w-5 text-green-700" />}
                    label={t("fleet.routesMonitored")}
                    value={`${dashboardStats.watchedRoutes}`}
                    tone="green"
                  />
                </section>

                {activeTab === "overview" ? (
                  <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:rounded-3xl md:p-6 xl:col-span-2">
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">
                          {t("fleet.fleetDispatchBoard")}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                          {t("fleet.fleetDispatchSubtitle")}
                        </p>
                      </div>

                      <div className="mt-5 grid gap-3 lg:grid-cols-2">
                        {dispatchBoard.length === 0 ? (
                          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-5 text-sm text-emerald-800">
                            {t("fleet.noDispatchRisks")}
                          </div>
                        ) : (
                          dispatchBoard.slice(0, 4).map((item) => (
                            <button
                              key={`${item.routeId}-${item.direction}`}
                              type="button"
                              onClick={() => {
                                setSelectedRouteId(item.routeId);
                                setActiveTab("vehicles");
                              }}
                              className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 text-left transition-transform hover:-translate-y-0.5"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">
                                    {t("common.route")} {item.routeNumber} •{" "}
                                    {formatDirection(item.direction, t)}
                                  </p>
                                  <p className="mt-1 font-semibold text-gray-900">
                                    {item.suggestedAction}
                                  </p>
                                  <p className="mt-1 text-sm text-gray-500">
                                    {t("fleet.headwayRisk", {
                                      minutes: item.headwayRiskMinutes,
                                    })}{" "}
                                    • {item.averageDelayMinutes} min delay
                                  </p>
                                  {item.suggestedBus ? (
                                    <p className="mt-2 text-xs font-semibold text-gray-600">
                                      {t("fleet.suggestedBus", {
                                        bus:
                                          item.suggestedBus.licensePlate ??
                                          item.suggestedBus.vehicleNumber,
                                      })}
                                    </p>
                                  ) : null}
                                </div>
                                <span className="w-fit shrink-0 rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-800">
                                  {t("fleet.priorityScore", { score: item.priorityScore })}
                                </span>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:rounded-3xl md:p-6">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">{t("fleet.routeHealth")}</h3>
                          <p className="mt-1 text-sm text-gray-500">
                            {t("fleet.routeHealthSubtitle")}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 space-y-3">
                        {routeHealth.map((route) => (
                          <button
                            key={route.id}
                            type="button"
                            onClick={() => {
                              setSelectedRouteId(route.id);
                              setActiveTab("vehicles");
                            }}
                            className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 text-left transition-transform hover:-translate-y-0.5"
                          >
                            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                              <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-brand">
                                  {t("common.route")} {route.routeNumber}
                                </p>
                                <p className="mt-1 font-semibold text-gray-900">{route.routeName}</p>
                              </div>

                              <div className="grid grid-cols-1 gap-2 text-center text-sm text-gray-600 sm:grid-cols-3 md:min-w-[240px]">
                                <div className="rounded-2xl bg-white px-3 py-3">
                                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                                    {t("fleet.delay")}
                                  </p>
                                  <p className="mt-1 font-semibold text-gray-900">
                                    {route.delayMinutes} {locale === "th" ? "นาที" : "min"}
                                  </p>
                                </div>
                                <div className="rounded-2xl bg-white px-3 py-3">
                                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                                    {t("fleet.liveBuses")}
                                  </p>
                                  <p className="mt-1 font-semibold text-gray-900">
                                    {route.liveBuses}
                                  </p>
                                </div>
                                <div className="rounded-2xl bg-white px-3 py-3">
                                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                                    {t("fleet.avgSpeed")}
                                  </p>
                                  <p className="mt-1 font-semibold text-gray-900">
                                    {route.averageSpeed} km/h
                                  </p>
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:rounded-3xl md:p-6">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">{t("fleet.topAlerts")}</h3>
                          <p className="mt-1 text-sm text-gray-500">
                            {t("fleet.topAlertsSubtitle")}
                          </p>
                        </div>
                        <Button variant="outline" onClick={() => setActiveTab("alerts")}>
                          {t("fleet.viewAllAlerts")}
                        </Button>
                      </div>

                      <div className="mt-5 space-y-3">
                        {topAlertsPreview.length === 0 ? (
                          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-5 text-sm text-emerald-800">
                            {t("fleet.noUrgentAlerts")}
                          </div>
                        ) : (
                          topAlertsPreview.map((alert) => (
                            <button
                              key={alert.id}
                              type="button"
                              onClick={() => {
                                setSelectedBusId(alert.busId);
                                setActiveTab("alerts");
                              }}
                              className={`w-full rounded-2xl border px-4 py-4 text-left transition-transform hover:-translate-y-0.5 ${getAlertToneClass(alert.tone)}`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3">
                                  <div className="rounded-2xl bg-white/80 p-3">
                                    {getAlertIcon(alert.severity)}
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-80">
                                      {t("common.route")} {alert.routeNumber}
                                    </p>
                                    <p className="mt-1 font-semibold">{alert.title}</p>
                                    <p className="mt-1 text-sm opacity-90">{alert.description}</p>
                                  </div>
                                </div>
                                <ChevronRight className="mt-1 h-4 w-4 shrink-0 opacity-60" />
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </section>
                ) : null}

                {activeTab === "alerts" ? (
                  <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:rounded-3xl md:p-6">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">{t("fleet.operationsAlerts")}</h3>
                        <p className="mt-1 text-sm text-gray-500">
                          {t("fleet.operationsAlertsSubtitle")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-gray-500">
                        <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">
                          {t("fleet.severeTraffic", { count: dashboardStats.severeTrafficBuses })}
                        </span>
                        <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700">
                          {t("fleet.fullBuses", { count: dashboardStats.fullBuses })}
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      {alerts.length === 0 ? (
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-5 text-sm text-emerald-800">
                          {t("fleet.noUrgentAlerts")}
                        </div>
                      ) : (
                        alerts.map((alert) => (
                          <button
                            key={alert.id}
                            type="button"
                            onClick={() => setSelectedBusId(alert.busId)}
                            className={`w-full rounded-2xl border px-4 py-4 text-left transition-transform hover:-translate-y-0.5 ${getAlertToneClass(alert.tone)}`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3">
                                <div className="rounded-2xl bg-white/80 p-3">
                                  {getAlertIcon(alert.severity)}
                                </div>
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-80">
                                    {t("common.route")} {alert.routeNumber}
                                  </p>
                                  <p className="mt-1 font-semibold">{alert.title}</p>
                                  <p className="mt-1 text-sm opacity-90">{alert.description}</p>
                                </div>
                              </div>
                              <ChevronRight className="mt-1 h-4 w-4 shrink-0 opacity-60" />
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </section>
                ) : null}

                {activeTab === "vehicles" ? (
                  <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:rounded-3xl md:p-6">
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">{t("fleet.liveVehicleBoard")}</h3>
                        <p className="mt-1 text-sm text-gray-500">
                          {t("fleet.liveVehicleSubtitle")}
                        </p>
                      </div>
                      <div className="text-sm text-gray-500">
                        {t("fleet.showingVehicles", { filtered: filteredBuses.length, total: buses.length })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_repeat(4,0.8fr)_auto]">
                      <label className="block">
                        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                          {t("common.search")}
                        </span>
                        <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3">
                          <Search className="h-4 w-4 text-gray-400" />
                          <input
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder={t("fleet.searchPlaceholder")}
                            className="w-full border-0 bg-transparent text-sm text-gray-900 outline-none"
                          />
                        </div>
                      </label>

                      <FilterSelect
                        label={t("common.route")}
                        value={selectedRouteId}
                        onChange={setSelectedRouteId}
                      >
                        <option value="all">{t("fleet.allRoutesOption")}</option>
                        {routeOptions.map((route) => (
                          <option key={route.id} value={route.id}>
                            {t("common.route")} {route.routeNumber} • {route.routeName}
                          </option>
                        ))}
                      </FilterSelect>

                      <FilterSelect
                        label={t("common.status")}
                        value={selectedStatus}
                        onChange={(value) => setSelectedStatus(value as "all" | BusStatus)}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </FilterSelect>

                      <FilterSelect
                        label={t("common.direction")}
                        value={selectedDirection}
                        onChange={(value) => setSelectedDirection(value as "all" | Direction)}
                      >
                        {DIRECTION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </FilterSelect>

                      <FilterSelect
                        label={t("fleet.allTraffic")}
                        value={selectedTraffic}
                        onChange={(value) => setSelectedTraffic(value as "all" | TrafficLevel)}
                      >
                        {TRAFFIC_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </FilterSelect>

                      <div className="flex items-end">
                        <Button
                          variant="outline"
                          onClick={clearFilters}
                          className="w-full xl:w-auto"
                        >
                          {t("common.clear")}
                        </Button>
                      </div>
                    </div>

                    {filteredBuses.length === 0 ? (
                      <EmptyState
                        icon={<BusFront className="h-12 w-12 mx-auto" />}
                        title={t("fleet.noVehiclesTitle")}
                        description={t("fleet.noVehiclesDescription")}
                        action={
                          <Button variant="outline" onClick={clearFilters}>
                            {t("common.resetFilters")}
                          </Button>
                        }
                      />
                    ) : (
                      <div className="space-y-3">
                        {filteredBuses.map((bus) => (
                          <button
                            key={bus.id}
                            type="button"
                            onClick={() => setSelectedBusId(bus.id)}
                            className="w-full rounded-3xl border border-gray-100 bg-gray-50 px-4 py-4 text-left transition-transform hover:-translate-y-0.5"
                            style={{ contentVisibility: "auto" }}
                          >
                            <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[1.25fr_0.85fr_0.95fr_0.95fr_1fr_auto] xl:items-center">
                              <div className="flex items-center gap-3">
                                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-lg font-bold text-white">
                                  {bus.routeNumber ?? bus.routeId}
                                </span>
                                <div>
                                  <p className="font-semibold text-gray-900">
                                    {bus.licensePlate ?? bus.vehicleNumber ?? bus.id}
                                  </p>
                                  <p className="mt-1 text-sm text-gray-500">
                                    {t("fleet.driver")}: {bus.driverName ?? t("fleet.driverUnassigned")}
                                  </p>
                                </div>
                              </div>

                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                                  {t("common.status")}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <span
                                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${getStatusBadgeClass(bus.status)}`}
                                  >
                                    {formatBusStatus(bus.status, t)}
                                  </span>
                                  <span
                                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${getTrafficBadgeClass(bus.trafficLevel)}`}
                                  >
                                    {t("fleet.trafficSuffix", { level: formatTraffic(bus.trafficLevel, t) })}
                                  </span>
                                </div>
                              </div>

                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                                  {t("common.direction")}
                                </p>
                                <p className="mt-2 text-sm font-semibold text-gray-900 capitalize">
                                  {formatDirection(bus.direction, t)}
                                </p>
                                <p className="mt-1 text-xs text-gray-500 capitalize">
                                  {t("fleet.occupancySuffix", { level: bus.occupancyLevel ?? t("fleet.moderate") })}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                                  {t("fleet.speedEta")}
                                </p>
                                <p className="mt-2 text-sm font-semibold text-gray-900">
                                  {typeof bus.speed === "number" ? `${Math.round(bus.speed)} km/h` : t("common.notAvailable")}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                  {t("fleet.etaMinutes", { minutes: bus.etaToNextStopMinutes ?? "--" })}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                                  {t("common.nextStop")}
                                </p>
                                <p className="mt-2 text-sm font-semibold text-gray-900">
                                  {bus.nextStopName ?? bus.nextStopId ?? t("common.notAvailable")}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                  {t("common.updated", { time: formatUpdatedTime(bus.lastUpdated, t) })}
                                </p>
                              </div>

                              <div className="flex items-center justify-between gap-3 xl:justify-end">
                                <div className="rounded-2xl bg-white px-3 py-3 text-center">
                                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                                    {t("common.capacity")}
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-gray-900">
                                    {bus.capacity ?? "--"}
                                  </p>
                                </div>
                                <ChevronRight className="h-5 w-5 text-gray-400" />
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  </section>
                ) : null}

                {activeTab === "shifts" ? (
                  <section className="grid grid-cols-1 gap-6 2xl:grid-cols-[0.95fr_1.05fr]">
                    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:rounded-3xl md:p-6">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">
                            {editingShiftId ? t("fleet.editShiftAssignment") : t("fleet.assignDriverShift")}
                          </h3>
                          <p className="mt-1 text-sm text-gray-500">
                            {t("fleet.shiftSubtitle")}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <Button
                            variant="outline"
                            onClick={() => setIsShiftFormOpen((currentValue) => !currentValue)}
                          >
                            {isShiftFormOpen ? t("fleet.hideShiftForm") : t("fleet.openShiftForm")}
                          </Button>
                          {editingShiftId ? (
                            <Button variant="outline" onClick={resetShiftForm}>
                              {t("common.cancelEdit")}
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                            {t("common.active")}
                          </p>
                          <p className="mt-2 text-2xl font-black text-emerald-900">
                            {shiftStats.active}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">
                            {t("common.scheduled")}
                          </p>
                          <p className="mt-2 text-2xl font-black text-amber-900">
                            {shiftStats.scheduled}
                          </p>
                        </div>
                      </div>

                      {(shiftActionError || shiftActionSuccess || fleetOperationsError) ? (
                        <div
                          className={`mt-5 rounded-2xl px-4 py-3 text-sm ${
                            shiftActionError || fleetOperationsError
                              ? "border border-red-100 bg-red-50 text-red-800"
                              : "border border-emerald-100 bg-emerald-50 text-emerald-800"
                          }`}
                        >
                          {shiftActionError ?? fleetOperationsError ?? shiftActionSuccess}
                        </div>
                      ) : null}

                      {isShiftFormOpen ? (
                      <form onSubmit={handleShiftSubmit} className="mt-5 space-y-4">
                        <FilterSelect
                          label={t("fleet.driver")}
                          value={shiftForm.driverId}
                          onChange={(value) => handleShiftFormChange("driverId", value)}
                        >
                          <option value="">{t("fleet.selectDriver")}</option>
                          {driverShiftOptions.map((driver) => (
                            <option key={driver.id} value={driver.id}>
                              {driver.label}
                            </option>
                          ))}
                        </FilterSelect>
                        {selectedDriverForShift ? (
                          <p className="-mt-2 text-xs text-gray-500">
                            {selectedDriverForShift.employeeCode}
                            {selectedDriverForShift.depotName
                              ? ` • ${selectedDriverForShift.depotName}`
                              : ""}
                          </p>
                        ) : null}

                        <FilterSelect
                          label={t("fleet.bus")}
                          value={shiftForm.busId}
                          onChange={(value) => handleShiftFormChange("busId", value)}
                        >
                          <option value="">{t("fleet.selectBus")}</option>
                          {fleetBuses.map((bus) => (
                            <option key={bus.id} value={bus.id}>
                              {bus.vehicleNumber}
                            </option>
                          ))}
                        </FilterSelect>
                        {selectedFleetBusForShift ? (
                          <p className="-mt-2 text-xs text-gray-500">
                            {selectedFleetBusForShift.licensePlate}
                            {selectedFleetBusForShift.routeNumber
                              ? ` • ${t("common.route")} ${selectedFleetBusForShift.routeNumber}`
                              : ""}
                          </p>
                        ) : null}

                        <FilterSelect
                          label={t("common.route")}
                          value={shiftForm.routeId}
                          onChange={(value) => handleShiftFormChange("routeId", value)}
                        >
                          <option value="">{t("fleet.selectRoute")}</option>
                          {routeOptions.map((route) => (
                            <option key={route.id} value={route.id}>
                              {t("common.route")} {route.routeNumber}
                            </option>
                          ))}
                        </FilterSelect>
                        {selectedRouteForShift ? (
                          <p className="-mt-2 text-xs text-gray-500">
                            {selectedRouteForShift.routeName}
                          </p>
                        ) : null}

                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                          <FilterSelect
                            label={t("common.direction")}
                            value={shiftForm.direction}
                            onChange={(value) =>
                              handleShiftFormChange("direction", value as Direction)
                            }
                          >
                            {DIRECTION_OPTIONS.filter((option) => option.value !== "all").map(
                              (option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ),
                            )}
                          </FilterSelect>

                          <FilterSelect
                            label={t("fleet.shiftStatus")}
                            value={shiftForm.status}
                            onChange={(value) =>
                              handleShiftFormChange(
                                "status",
                                value as ShiftFormState["status"],
                              )
                            }
                          >
                            <option value="SCHEDULED">{t("common.scheduled")}</option>
                            <option value="ACTIVE">{t("common.active")}</option>
                          </FilterSelect>
                        </div>

                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                          <CalendarField
                            label={t("fleet.shiftStart")}
                            mode="datetime"
                            value={shiftForm.shiftStartAt}
                            onChange={(nextValue) =>
                              handleShiftFormChange("shiftStartAt", nextValue)
                            }
                            placeholder={t("fleet.shiftStart")}
                            required
                          />

                          <CalendarField
                            label={t("fleet.shiftEnd")}
                            mode="datetime"
                            value={shiftForm.shiftEndAt}
                            onChange={(nextValue) =>
                              handleShiftFormChange("shiftEndAt", nextValue)
                            }
                            placeholder={t("fleet.shiftEnd")}
                            required
                          />
                        </div>

                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                            {t("common.notes")}
                          </span>
                          <textarea
                            value={shiftForm.notes}
                            onChange={(event) =>
                              handleShiftFormChange("notes", event.target.value)
                            }
                            rows={4}
                            placeholder={t("fleet.notesPlaceholder")}
                            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-colors focus:border-brand"
                          />
                        </label>

                        <div className="flex flex-wrap gap-3">
                          <Button
                            type="submit"
                            variant="primary"
                            isLoading={isSubmittingShift}
                            disabled={
                              isSubmittingShift ||
                              !shiftForm.driverId ||
                              !shiftForm.busId ||
                              !shiftForm.routeId
                            }
                          >
                            {editingShiftId ? t("fleet.updateShift") : t("fleet.assignShift")}
                          </Button>
                          <Button type="button" variant="outline" onClick={resetShiftForm}>
                            {t("common.resetForm")}
                          </Button>
                        </div>
                      </form>
                      ) : (
                        <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 text-sm text-gray-600">
                          {t("fleet.shiftFormCollapsed")}
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:rounded-3xl md:p-6">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">{t("fleet.driverShiftTable")}</h3>
                          <p className="mt-1 text-sm text-gray-500">
                            {t("fleet.driverShiftSubtitle")}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-gray-500">
                          <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700">
                            {shiftStats.completed} {t("common.completed")}
                          </span>
                          <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">
                            {shiftStats.missed} {t("common.missed")}
                          </span>
                        </div>
                      </div>

                      <div className="mt-5">
                          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="text-sm text-gray-500">
                              {t("fleet.shiftPageSummary", {
                                from: sortedShifts.length === 0 ? 0 : (currentShiftPage - 1) * SHIFT_PAGE_SIZE + 1,
                                to: Math.min(currentShiftPage * SHIFT_PAGE_SIZE, sortedShifts.length),
                                total: sortedShifts.length,
                              })}
                            </div>
                            <div className="flex flex-col gap-3">
                              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.3fr_0.8fr_0.8fr_auto]">
                                <label className="block">
                                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                                    {t("fleet.searchShifts")}
                                  </span>
                                  <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3">
                                    <Search className="h-4 w-4 text-gray-400" />
                                    <input
                                      value={shiftSearchQuery}
                                      onChange={(event) => {
                                        setShiftSearchQuery(event.target.value);
                                        setShiftPage(1);
                                      }}
                                      placeholder={t("fleet.searchShiftsPlaceholder")}
                                      className="w-full border-0 bg-transparent text-sm text-gray-900 outline-none"
                                    />
                                  </div>
                                </label>

                                <CalendarField
                                  label={t("fleet.shiftDateFrom")}
                                  value={shiftDateFrom}
                                  onChange={(nextValue) => {
                                    setShiftDateFrom(nextValue);
                                    setShiftPage(1);
                                  }}
                                  placeholder={t("fleet.shiftDateFrom")}
                                  clearable
                                />

                                <CalendarField
                                  label={t("fleet.shiftDateTo")}
                                  value={shiftDateTo}
                                  onChange={(nextValue) => {
                                    setShiftDateTo(nextValue);
                                    setShiftPage(1);
                                  }}
                                  placeholder={t("fleet.shiftDateTo")}
                                  clearable
                                />

                                <div className="flex items-end">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={clearShiftFilters}
                                    className="w-full lg:w-auto"
                                  >
                                    {t("fleet.clearShiftFilters")}
                                  </Button>
                                </div>
                              </div>

                            <div className="flex flex-wrap items-center gap-2 self-end">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setShiftPage((currentValue) => Math.max(1, currentValue - 1))}
                                  disabled={shiftPage <= 1}
                                >
                                  {t("fleet.previousPage")}
                                </Button>
                                <div className="rounded-2xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">
                                  {t("fleet.shiftPageIndicator", {
                                    current: currentShiftPage,
                                    total: totalShiftPages,
                                  })}
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setShiftPage((currentValue) =>
                                      Math.min(totalShiftPages, currentValue + 1),
                                    )
                                  }
                                  disabled={currentShiftPage >= totalShiftPages}
                                >
                                  {t("fleet.nextPage")}
                                </Button>
                              </div>
                            </div>
                          </div>

                          {sortedShifts.length === 0 ? (
                            <div className="mt-5">
                              <EmptyState
                                icon={<ClipboardList className="mx-auto h-12 w-12" />}
                                title={
                                  hasActiveShiftFilters
                                    ? t("fleet.noFilteredShiftsTitle")
                                    : t("fleet.noDriverShiftsTitle")
                                }
                                description={
                                  hasActiveShiftFilters
                                    ? t("fleet.noFilteredShiftsDescription")
                                    : t("fleet.noDriverShiftsDescription")
                                }
                                action={
                                  hasActiveShiftFilters ? (
                                    <Button variant="outline" onClick={clearShiftFilters}>
                                      {t("fleet.clearShiftFilters")}
                                    </Button>
                                  ) : undefined
                                }
                              />
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="min-w-[980px] divide-y divide-gray-100 text-sm">
                                <thead>
                                  <tr className="text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                                    <th className="px-4 py-3">{t("fleet.driver")}</th>
                                    <th className="px-4 py-3">{t("fleet.bus")}</th>
                                    <th className="px-4 py-3">{t("common.route")}</th>
                                    <th className="px-4 py-3">{t("fleet.window")}</th>
                                    <th className="px-4 py-3">{t("common.status")}</th>
                                    <th className="px-4 py-3">{t("common.notes")}</th>
                                    <th className="px-4 py-3 text-right">{t("fleet.actions")}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {paginatedShifts.map((shift) => (
                                    <tr key={shift.id} className="align-top">
                                      <td className="px-4 py-4">
                                        <p className="font-semibold text-gray-900">
                                          {shift.driverName ?? shift.driverId}
                                        </p>
                                        <p className="mt-1 text-xs text-gray-500">{shift.driverId}</p>
                                      </td>
                                      <td className="px-4 py-4">
                                        <p className="font-semibold text-gray-900">
                                          {shift.busVehicleNumber ?? shift.busId}
                                        </p>
                                        <p className="mt-1 text-xs text-gray-500">
                                          {shift.busLicensePlate ?? shift.busId}
                                        </p>
                                      </td>
                                      <td className="px-4 py-4">
                                        <p className="font-semibold text-gray-900">
                                          {t("common.route")} {shift.routeNumber ?? shift.routeId}
                                        </p>
                                        <p className="mt-1 text-xs capitalize text-gray-500">
                                          {formatDirection(shift.direction, t)}
                                        </p>
                                      </td>
                                      <td className="px-4 py-4">
                                        <div className="flex items-start gap-2 text-gray-700">
                                          <CalendarRange className="mt-0.5 h-4 w-4 text-gray-400" />
                                          <div>
                                            <p className="font-medium text-gray-900">
                                              {formatShiftDateRange(
                                                shift.shiftStartAt,
                                                shift.shiftEndAt,
                                              )}
                                            </p>
                                            <p className="mt-1 text-xs text-gray-500">
                                              {t("fleet.checkIn", {
                                                time: shift.checkInAt
                                                  ? new Date(shift.checkInAt).toLocaleTimeString([], {
                                                      hour: "2-digit",
                                                      minute: "2-digit",
                                                    })
                                                  : "--",
                                              })}
                                            </p>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-4 py-4">
                                        <span
                                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${getShiftStatusBadgeClass(
                                            shift.status,
                                          )}`}
                                        >
                                          {formatShiftStatus(shift.status, t)}
                                        </span>
                                      </td>
                                      <td className="max-w-[240px] px-4 py-4 text-gray-600">
                                        {shift.notes ?? t("fleet.noNotes")}
                                      </td>
                                      <td className="px-4 py-4">
                                        <div className="flex justify-end gap-2">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => startEditingShift(shift)}
                                          >
                                            <PenSquare className="mr-2 h-4 w-4" />
                                            {t("common.edit")}
                                          </Button>
                                          {shift.status === "ACTIVE" || shift.status === "SCHEDULED" ? (
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => handleCloseShift(shift)}
                                              disabled={isSubmittingShift}
                                            >
                                              <XCircle className="mr-2 h-4 w-4" />
                                              {t("common.close")}
                                            </Button>
                                          ) : null}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                      </div>
                    </div>
                  </section>
                ) : null}
              </>
            )}
          </div>
        </main>
      </div>

      {selectedBus ? (
        <BusDetailSheet bus={selectedBus} onClose={() => setSelectedBusId(null)} />
      ) : null}

      {isAuthenticated && canUseFleetPage ? (
        <FleetAssistantPanel
          selectedRouteId={selectedRouteId}
          selectedBusId={selectedBusId}
          activeTab={activeTab}
        />
      ) : null}
    </div>
  );
}
