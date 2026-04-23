import {
  Body,
  Controller,
  Get,
  Headers,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateFleetAccountDto } from './dto/create-fleet-account.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  getUsers(@Headers('x-busbuddy-user-id') actorUserId?: string) {
    return this.adminService.getUsers(actorUserId);
  }

  @Patch('users/:userId')
  updateUser(
    @Param('userId') userId: string,
    @Body() dto: UpdateAdminUserDto,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
  ) {
    return this.adminService.updateUser(userId, dto, actorUserId);
  }

  @Delete('users/:userId')
  @HttpCode(204)
  async deleteUser(
    @Param('userId') userId: string,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
  ) {
    await this.adminService.deleteUser(userId, actorUserId);
  }

  @Post('users/:userId/reset-password')
  resetUserPassword(
    @Param('userId') userId: string,
    @Body() dto: ResetUserPasswordDto,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
  ) {
    return this.adminService.resetUserPassword(userId, dto, actorUserId);
  }

  @Post('fleet-accounts')
  createFleetAccount(
    @Body() dto: CreateFleetAccountDto,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
  ) {
    return this.adminService.createFleetAccount(dto, actorUserId);
  }

  @Get('system-health')
  getSystemHealth(@Headers('x-busbuddy-user-id') actorUserId?: string) {
    return this.adminService.getSystemHealth(actorUserId);
  }

  @Get('audit-logs')
  getAuditLogs(@Headers('x-busbuddy-user-id') actorUserId?: string) {
    return this.adminService.getAuditLogs(actorUserId);
  }

  @Get('fleet-preview')
  getFleetPreview(@Headers('x-busbuddy-user-id') actorUserId?: string) {
    return this.adminService.getScopedFleetPreview(actorUserId);
  }
}
