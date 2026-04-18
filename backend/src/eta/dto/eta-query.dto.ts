import { IsString } from 'class-validator';

export class EtaQueryDto {
  @IsString()
  stopId!: string;
}
