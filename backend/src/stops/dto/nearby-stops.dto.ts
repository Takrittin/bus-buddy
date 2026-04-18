import { IsNumber, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class NearbyStopsDto {
  @IsNumber()
  @Type(() => Number)
  lat!: number;

  @IsNumber()
  @Type(() => Number)
  lng!: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(100)
  @Max(10000)
  radius?: number = 1000; // in meters, default 1km
}
