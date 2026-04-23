import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  content!: string;
}

export class FleetAssistantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  message!: string;

  @IsOptional()
  @IsIn(['en', 'th'])
  locale?: 'en' | 'th';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @IsOptional()
  @IsString()
  selectedRouteId?: string;

  @IsOptional()
  @IsString()
  selectedBusId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['overview', 'alerts', 'vehicles', 'shifts'])
  activeTab?: 'overview' | 'alerts' | 'vehicles' | 'shifts';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];
}
