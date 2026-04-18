import { Controller, Get, Query } from '@nestjs/common';
import { EtaService } from './eta.service';
import { EtaQueryDto } from './dto/eta-query.dto';

@Controller('eta')
export class EtaController {
  constructor(private readonly etaService: EtaService) {}

  @Get()
  findForStop(@Query() query: EtaQueryDto) {
    return this.etaService.getEtaForStop(query.stopId);
  }
}
