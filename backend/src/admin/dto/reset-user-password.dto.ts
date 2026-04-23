import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class ResetUserPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword!: string;

  @IsBoolean()
  @IsOptional()
  mustResetPassword?: boolean;

  @IsString()
  @IsOptional()
  reason?: string;
}
