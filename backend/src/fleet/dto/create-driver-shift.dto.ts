import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { RouteDirection, ShiftStatus } from '@prisma/client';

export class CreateDriverShiftDto {
  @IsString()
  @MinLength(1)
  driverId!: string;

  @IsString()
  @MinLength(1)
  busId!: string;

  @IsString()
  @MinLength(1)
  routeId!: string;

  @IsEnum(RouteDirection)
  direction!: RouteDirection;

  @IsDateString()
  shiftStartAt!: string;

  @IsDateString()
  shiftEndAt!: string;

  @IsOptional()
  @IsDateString()
  checkInAt?: string;

  @IsOptional()
  @IsEnum(ShiftStatus)
  status?: ShiftStatus;

  @IsOptional()
  @Type(() => String)
  @IsString()
  notes?: string;
}
