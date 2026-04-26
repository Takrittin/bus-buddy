import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { CreatePromptPayPaymentDto } from './dto/create-promptpay-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('promptpay')
  createPromptPayPayment(
    @Body() dto: CreatePromptPayPaymentDto,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.paymentsService.createPromptPayPayment(
      dto,
      actorUserId,
      actorSessionVersion,
    );
  }

  @Get('orders/:orderId')
  getOrder(
    @Param('orderId') orderId: string,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.paymentsService.getOrder(
      orderId,
      actorUserId,
      actorSessionVersion,
    );
  }

  @Post('stripe/webhook')
  handleStripeWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    return this.paymentsService.handleStripeWebhook(request.rawBody, signature);
  }
}
