import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { FleetService } from './fleet.service';
import { CreateDriverShiftDto } from './dto/create-driver-shift.dto';
import { UpdateDriverShiftDto } from './dto/update-driver-shift.dto';
import { CloseDriverShiftDto } from './dto/close-driver-shift.dto';

@Controller('fleet')
export class FleetController {
  constructor(private readonly fleetService: FleetService) {}

  @Get('buses')
  getBuses() {
    return this.fleetService.getBuses();
  }

  @Get('buses/:busId')
  getBus(@Param('busId') busId: string) {
    return this.fleetService.getBus(busId);
  }

  @Get('drivers')
  getDrivers() {
    return this.fleetService.getDrivers();
  }

  @Get('drivers/:driverId')
  getDriver(@Param('driverId') driverId: string) {
    return this.fleetService.getDriver(driverId);
  }

  @Get('shifts')
  getDriverShifts() {
    return this.fleetService.getDriverShifts();
  }

  @Get('shifts/current')
  getCurrentDriverShifts() {
    return this.fleetService.getCurrentDriverShifts();
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
