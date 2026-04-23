import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

class CreateNotificationSubscriptionDto {
  @IsString()
  stopId!: string;

  @IsString()
  routeId!: string;

  @Type(() => Number)
  @Min(1)
  leadTimeMinutes!: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  password!: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id/favorite-stops')
  getFavoriteStops(
    @Param('id') id: string,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.usersService.getFavoriteStops(id, actorUserId, actorSessionVersion);
  }

  @Post(':id/favorite-stops/:stopId')
  addFavoriteStop(
    @Param('id') id: string,
    @Param('stopId') stopId: string,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.usersService.addFavoriteStop(id, stopId, actorUserId, actorSessionVersion);
  }

  @Delete(':id/favorite-stops/:stopId')
  @HttpCode(204)
  async removeFavoriteStop(
    @Param('id') id: string,
    @Param('stopId') stopId: string,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    await this.usersService.removeFavoriteStop(id, stopId, actorUserId, actorSessionVersion);
  }

  @Get(':id/notification-subscriptions')
  getNotificationSubscriptions(
    @Param('id') id: string,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.usersService.getNotificationSubscriptions(id, actorUserId, actorSessionVersion);
  }

  @Get(':id/notification-subscriptions/find/:stopId/:routeId')
  findNotificationSubscription(
    @Param('id') id: string,
    @Param('stopId') stopId: string,
    @Param('routeId') routeId: string,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.usersService.findNotificationSubscription(
      id,
      stopId,
      routeId,
      actorUserId,
      actorSessionVersion,
    );
  }

  @Post(':id/notification-subscriptions')
  addNotificationSubscription(
    @Param('id') id: string,
    @Body() createNotificationSubscriptionDto: CreateNotificationSubscriptionDto,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.usersService.addNotificationSubscription({
      userId: id,
      stopId: createNotificationSubscriptionDto.stopId,
      routeId: createNotificationSubscriptionDto.routeId,
      leadTimeMinutes: createNotificationSubscriptionDto.leadTimeMinutes,
      isActive: createNotificationSubscriptionDto.isActive,
      actorUserId,
      actorSessionVersion,
    });
  }

  @Delete(':id/notification-subscriptions/:subscriptionId')
  @HttpCode(204)
  async removeNotificationSubscription(
    @Param('id') id: string,
    @Param('subscriptionId') subscriptionId: string,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    await this.usersService.removeNotificationSubscription(
      id,
      subscriptionId,
      actorUserId,
      actorSessionVersion,
    );
  }

  @Post(':id/change-password')
  changePassword(
    @Param('id') id: string,
    @Body() changePasswordDto: ChangePasswordDto,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.usersService.changePassword(id, {
      password: changePasswordDto.password,
    }, actorUserId, actorSessionVersion);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
