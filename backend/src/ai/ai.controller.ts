import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { FleetAssistantDto } from './dto/fleet-assistant.dto';
import { UserAssistantDto } from './dto/user-assistant.dto';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('user-assistant')
  getUserAssistantReply(@Body() userAssistantDto: UserAssistantDto) {
    return this.aiService.replyToUserAssistant(userAssistantDto);
  }

  @Post('fleet-assistant')
  getFleetAssistantReply(@Body() fleetAssistantDto: FleetAssistantDto) {
    return this.aiService.replyToFleetAssistant(fleetAssistantDto);
  }
}
