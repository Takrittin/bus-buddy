import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { UserAssistantDto } from './dto/user-assistant.dto';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('user-assistant')
  getUserAssistantReply(@Body() userAssistantDto: UserAssistantDto) {
    return this.aiService.replyToUserAssistant(userAssistantDto);
  }
}
