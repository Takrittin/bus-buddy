import { Direction } from "@/types/bus";

export type ShiftStatus = "SCHEDULED" | "ACTIVE" | "COMPLETED" | "MISSED";

export interface FleetBusRecord {
  id: string;
  vehicleNumber: string;
  licensePlate: string;
  capacity: number;
  routeId?: string | null;
  routeNumber?: string | null;
  driverId?: string | null;
  driverName?: string | null;
  depotName?: string | null;
  serviceStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface DriverShift {
  id: string;
  driverId: string;
  busId: string;
  routeId: string;
  direction: Direction;
  shiftStartAt: string;
  shiftEndAt: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  status: ShiftStatus;
  notes?: string | null;
  driverName?: string | null;
  busVehicleNumber?: string | null;
  routeNumber?: string | null;
}

export interface FleetDriver {
  id: string;
  employeeCode: string;
  fullName: string;
  phoneNumber?: string | null;
  licenseNumber: string;
  licenseExpiryDate?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  depotName?: string | null;
  status: string;
  assignedBuses: FleetBusRecord[];
  recentShifts: DriverShift[];
}

export interface DriverShiftInput {
  driverId: string;
  busId: string;
  routeId: string;
  direction: Direction;
  shiftStartAt: string;
  shiftEndAt: string;
  checkInAt?: string;
  status?: Extract<ShiftStatus, "SCHEDULED" | "ACTIVE">;
  notes?: string;
}

export interface CloseDriverShiftInput {
  checkOutAt?: string;
  notes?: string;
  status?: Extract<ShiftStatus, "COMPLETED" | "MISSED">;
}
