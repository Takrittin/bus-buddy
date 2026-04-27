import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('me')
  getMyBillingStatus(
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.billingService.getBillingStatus(actorUserId, actorSessionVersion);
  }

  @Post('checkout-session')
  createCheckoutSession(
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.billingService.createCheckoutSession(
      actorUserId,
      actorSessionVersion,
    );
  }

  @Post('checkout-session/sync')
  syncCheckoutSession(
    @Body('sessionId') sessionId?: string,
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.billingService.syncCheckoutSessionById(
      sessionId,
      actorUserId,
      actorSessionVersion,
    );
  }

  @Post('customer-portal')
  createCustomerPortalSession(
    @Headers('x-busbuddy-user-id') actorUserId?: string,
    @Headers('x-busbuddy-session-version') actorSessionVersion?: string,
  ) {
    return this.billingService.createCustomerPortalSession(
      actorUserId,
      actorSessionVersion,
    );
  }

  @Post('stripe/webhook')
  handleStripeWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    return this.billingService.handleStripeWebhook(request.rawBody, signature);
  }
}
