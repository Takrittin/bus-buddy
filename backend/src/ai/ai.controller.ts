import { Body, Controller, Headers, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { AdminAssistantDto } from './dto/admin-assistant.dto';
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

  @Post('admin-assistant')
  getAdminAssistantReply(
    @Body() adminAssistantDto: AdminAssistantDto,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.aiService.replyToAdminAssistant(
      adminAssistantDto,
      actorUserId,
      actorSessionVersion,
    );
  }
}
