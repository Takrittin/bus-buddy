export const USER_ROLES = ['USER', 'ADMIN', 'FLEET'] as const;

export type UserRole = (typeof USER_ROLES)[number];
