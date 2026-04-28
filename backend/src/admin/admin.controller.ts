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
import { DeleteUserDto } from './dto/delete-user.dto';
import { GrantPremiumUserDto } from './dto/grant-premium-user.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  getUsers(
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.adminService.getUsers(actorUserId, actorSessionVersion);
  }

  @Patch('users/:userId')
  updateUser(
    @Param('userId') userId: string,
    @Body() dto: UpdateAdminUserDto,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.adminService.updateUser(userId, dto, actorUserId, actorSessionVersion);
  }

  @Delete('users/:userId')
  @HttpCode(204)
  async deleteUser(
    @Param('userId') userId: string,
    @Body() dto: DeleteUserDto,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    await this.adminService.deleteUser(userId, dto, actorUserId, actorSessionVersion);
  }

  @Post('users/:userId/reset-password')
  resetUserPassword(
    @Param('userId') userId: string,
    @Body() dto: ResetUserPasswordDto,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.adminService.resetUserPassword(userId, dto, actorUserId, actorSessionVersion);
  }

  @Post('users/:userId/premium')
  grantUserPremium(
    @Param('userId') userId: string,
    @Body() dto: GrantPremiumUserDto,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.adminService.grantUserPremium(userId, dto, actorUserId, actorSessionVersion);
  }

  @Post('fleet-accounts')
  createFleetAccount(
    @Body() dto: CreateFleetAccountDto,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.adminService.createFleetAccount(dto, actorUserId, actorSessionVersion);
  }

  @Get('system-health')
  getSystemHealth(
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.adminService.getSystemHealth(actorUserId, actorSessionVersion);
  }

  @Get('audit-logs')
  getAuditLogs(
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.adminService.getAuditLogs(actorUserId, actorSessionVersion);
  }

  @Get('fleet-preview')
  getFleetPreview(
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.adminService.getScopedFleetPreview(actorUserId, actorSessionVersion);
  }
}
