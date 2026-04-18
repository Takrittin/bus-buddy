import { PartialType } from '@nestjs/mapped-types';
import { CreateDriverShiftDto } from './create-driver-shift.dto';

export class UpdateDriverShiftDto extends PartialType(CreateDriverShiftDto) {}
