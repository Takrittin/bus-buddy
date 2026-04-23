import { IsBoolean, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { USER_ROLES, type UserRole } from '../../users/user-role';

export class UpdateAdminUserDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsIn(USER_ROLES)
  @IsOptional()
  role?: UserRole;

  @IsString()
  @IsOptional()
  operatorName?: string;

  @IsString()
  @IsOptional()
  depotName?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  mustResetPassword?: boolean;

  @IsString()
  @IsOptional()
  reason?: string;
}
