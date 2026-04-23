import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { FleetService } from './fleet.service';
import { CreateDriverShiftDto } from './dto/create-driver-shift.dto';
import { UpdateDriverShiftDto } from './dto/update-driver-shift.dto';
import { CloseDriverShiftDto } from './dto/close-driver-shift.dto';

@Controller('fleet')
export class FleetController {
  constructor(private readonly fleetService: FleetService) {}

  @Get('buses')
  getBuses(@Headers('x-busbuddy-user-id') actorUserId?: string) {
    return this.fleetService.getBuses(actorUserId);
  }

  @Get('buses/:busId')
  getBus(@Param('busId') busId: string, @Headers('x-busbuddy-user-id') actorUserId?: string) {
    return this.fleetService.getBus(busId, actorUserId);
  }

  @Get('drivers')
  getDrivers(@Headers('x-busbuddy-user-id') actorUserId?: string) {
    return this.fleetService.getDrivers(actorUserId);
  }

  @Get('drivers/:driverId')
  getDriver(
    @Param('driverId') driverId: string,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
  ) {
    return this.fleetService.getDriver(driverId, actorUserId);
  }

  @Get('shifts')
  getDriverShifts(@Headers('x-busbuddy-user-id') actorUserId?: string) {
    return this.fleetService.getDriverShifts(actorUserId);
  }

  @Get('shifts/current')
  getCurrentDriverShifts(@Headers('x-busbuddy-user-id') actorUserId?: string) {
    return this.fleetService.getCurrentDriverShifts(actorUserId);
  }

  @Post('shifts')
  createDriverShift(@Body() createDriverShiftDto: CreateDriverShiftDto) {
    return this.fleetService.createDriverShift(createDriverShiftDto);
  }

  @Patch('shifts/:shiftId')
  updateDriverShift(
    @Param('shiftId') shiftId: string,
    @Body() updateDriverShiftDto: UpdateDriverShiftDto,
  ) {
    return this.fleetService.updateDriverShift(shiftId, updateDriverShiftDto);
  }

  @Post('shifts/:shiftId/close')
  closeDriverShift(
    @Param('shiftId') shiftId: string,
    @Body() closeDriverShiftDto: CloseDriverShiftDto,
  ) {
    return this.fleetService.closeDriverShift(shiftId, closeDriverShiftDto);
  }
}
