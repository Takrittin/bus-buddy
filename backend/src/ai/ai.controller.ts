import { Body, Controller, Headers, Post } from '@nestjs/common';
import { BillingService } from '../billing/billing.service';
import { AiService } from './ai.service';
import { AdminAssistantDto } from './dto/admin-assistant.dto';
import { FleetAssistantDto } from './dto/fleet-assistant.dto';
import { UserAssistantDto } from './dto/user-assistant.dto';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly billingService: BillingService,
  ) {}

  @Post('user-assistant')
  async getUserAssistantReply(
    @Body() userAssistantDto: UserAssistantDto,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    await this.billingService.assertPremiumAccess(
      actorUserId,
      actorSessionVersion,
    );
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
