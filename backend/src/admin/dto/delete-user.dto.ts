import { IsOptional, IsString } from 'class-validator';

export class DeleteUserDto {
  @IsString()
  @IsOptional()
  reason?: string;
}
