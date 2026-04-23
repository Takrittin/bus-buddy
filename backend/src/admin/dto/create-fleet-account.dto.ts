import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateFleetAccountDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsOptional()
  operatorName?: string;

  @IsString()
  @IsOptional()
  depotName?: string;
}
