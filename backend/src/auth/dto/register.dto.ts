import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { USER_ROLES, type UserRole } from '../../users/user-role';

export class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsIn(USER_ROLES)
  @IsOptional()
  role?: UserRole;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string;
}
