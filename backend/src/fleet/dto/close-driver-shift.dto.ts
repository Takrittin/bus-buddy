import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ShiftStatus } from '@prisma/client';

export class CloseDriverShiftDto {
  @IsOptional()
  @IsDateString()
  checkOutAt?: string;

  @IsOptional()
  @IsEnum(ShiftStatus)
  status?: ShiftStatus;

  @IsOptional()
  @Type(() => String)
  @IsString()
  notes?: string;
}
