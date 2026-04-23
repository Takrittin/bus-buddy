export type UserRole = "USER" | "ADMIN" | "FLEET";

export interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: UserRole;
  operatorName?: string | null;
  depotName?: string | null;
  isActive?: boolean;
  mustResetPassword?: boolean;
  sessionVersion?: number;
  lastLoginAt?: string | null;
  deletedAt?: string | null;
  isGuest: boolean;
}

export interface Session {
  user: User;
  expires: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
  role?: UserRole;
}

export interface ChangePasswordInput {
  password: string;
}
