import { fetchApi } from "@/lib/api-client";
import {
  CloseDriverShiftInput,
  DriverShift,
  DriverShiftInput,
  FleetBusRecord,
  FleetDriver,
  ShiftStatus,
} from "@/types/fleet";

interface ApiFleetBusResponse {
  id: string;
  vehicle_number: string;
  license_plate: string;
  capacity: number;
  route_id: string | null;
  route_number: string | null;
  driver_id: string | null;
  driver_name: string | null;
  depot_name: string | null;
  service_status: string;
  created_at: string;
  updated_at: string;
}

interface ApiFleetShiftResponse {
  id: string;
  driver_id: string;
  bus_id: string;
  route_id: string;
  direction: "OUTBOUND" | "INBOUND";
  shift_start_at: string;
  shift_end_at: string;
  check_in_at?: string | null;
  check_out_at?: string | null;
  status: ShiftStatus;
  notes?: string | null;
  driver_name?: string | null;
  bus_vehicle_number?: string | null;
  route_number?: string | null;
}

interface ApiFleetDriverResponse {
  id: string;
  employee_code: string;
  full_name: string;
  phone_number?: string | null;
  license_number: string;
  license_expiry_date?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  depot_name?: string | null;
  status: string;
  assigned_buses: ApiFleetBusResponse[];
  recent_shifts: ApiFleetShiftResponse[];
}

function mapDirection(value: "OUTBOUND" | "INBOUND") {
  return value === "INBOUND" ? "inbound" : "outbound";
}

function toApiDirection(value: DriverShiftInput["direction"]) {
  return value === "inbound" ? "INBOUND" : "OUTBOUND";
}

function mapFleetBusResponse(bus: ApiFleetBusResponse): FleetBusRecord {
  return {
    id: bus.id,
    vehicleNumber: bus.vehicle_number,
    licensePlate: bus.license_plate,
    capacity: bus.capacity,
    routeId: bus.route_id,
    routeNumber: bus.route_number,
    driverId: bus.driver_id,
    driverName: bus.driver_name,
    depotName: bus.depot_name,
    serviceStatus: bus.service_status,
    createdAt: bus.created_at,
    updatedAt: bus.updated_at,
  };
}

function mapFleetShiftResponse(shift: ApiFleetShiftResponse): DriverShift {
  return {
    id: shift.id,
    driverId: shift.driver_id,
    busId: shift.bus_id,
    routeId: shift.route_id,
    direction: mapDirection(shift.direction),
    shiftStartAt: shift.shift_start_at,
    shiftEndAt: shift.shift_end_at,
    checkInAt: shift.check_in_at,
    checkOutAt: shift.check_out_at,
    status: shift.status,
    notes: shift.notes,
    driverName: shift.driver_name,
    busVehicleNumber: shift.bus_vehicle_number,
    routeNumber: shift.route_number,
  };
}

function mapFleetDriverResponse(driver: ApiFleetDriverResponse): FleetDriver {
  return {
    id: driver.id,
    employeeCode: driver.employee_code,
    fullName: driver.full_name,
    phoneNumber: driver.phone_number,
    licenseNumber: driver.license_number,
    licenseExpiryDate: driver.license_expiry_date,
    emergencyContactName: driver.emergency_contact_name,
    emergencyContactPhone: driver.emergency_contact_phone,
    depotName: driver.depot_name,
    status: driver.status,
    assignedBuses: driver.assigned_buses.map(mapFleetBusResponse),
    recentShifts: driver.recent_shifts.map(mapFleetShiftResponse),
  };
}

export async function getFleetBuses() {
  const buses = await fetchApi<ApiFleetBusResponse[]>("/fleet/buses");
  return buses.map(mapFleetBusResponse);
}

export async function getFleetDrivers() {
  const drivers = await fetchApi<ApiFleetDriverResponse[]>("/fleet/drivers");
  return drivers.map(mapFleetDriverResponse);
}

export async function getFleetShifts() {
  const shifts = await fetchApi<ApiFleetShiftResponse[]>("/fleet/shifts");
  return shifts.map(mapFleetShiftResponse);
}

export async function createFleetShift(input: DriverShiftInput) {
  const shift = await fetchApi<ApiFleetShiftResponse>("/fleet/shifts", {
    method: "POST",
    body: JSON.stringify({
      driverId: input.driverId,
      busId: input.busId,
      routeId: input.routeId,
      direction: toApiDirection(input.direction),
      shiftStartAt: input.shiftStartAt,
      shiftEndAt: input.shiftEndAt,
      checkInAt: input.checkInAt || undefined,
      status: input.status,
      notes: input.notes || undefined,
    }),
  });

  return mapFleetShiftResponse(shift);
}

export async function updateFleetShift(shiftId: string, input: Partial<DriverShiftInput>) {
  const shift = await fetchApi<ApiFleetShiftResponse>(`/fleet/shifts/${shiftId}`, {
    method: "PATCH",
    body: JSON.stringify({
      driverId: input.driverId,
      busId: input.busId,
      routeId: input.routeId,
      direction: input.direction ? toApiDirection(input.direction) : undefined,
      shiftStartAt: input.shiftStartAt,
      shiftEndAt: input.shiftEndAt,
      checkInAt: input.checkInAt,
      status: input.status,
      notes: input.notes,
    }),
  });

  return mapFleetShiftResponse(shift);
}

export async function closeFleetShift(shiftId: string, input?: CloseDriverShiftInput) {
  const shift = await fetchApi<ApiFleetShiftResponse>(`/fleet/shifts/${shiftId}/close`, {
    method: "POST",
    body: JSON.stringify({
      checkOutAt: input?.checkOutAt,
      notes: input?.notes,
      status: input?.status,
    }),
  });

  return mapFleetShiftResponse(shift);
}
