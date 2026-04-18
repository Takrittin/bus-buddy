import {
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { USER_ROLES, type UserRole } from '../user-role';

export class CreateUserDto {
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

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  favoriteStopIds?: string[];
}
