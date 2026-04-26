import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, TicketOrderStatus } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { resolveRequestActor } from '../common/request-actor';
import {
  CreatePromptPayPaymentDto,
  TicketProductType,
} from './dto/create-promptpay-payment.dto';

type TicketOrderWithTicket = Prisma.TicketOrderGetPayload<{
  include: { ticket: true };
}>;
type StripeClient = Stripe.Stripe;
type StripeEvent = ReturnType<StripeClient['webhooks']['constructEvent']>;
type StripePaymentIntent = Awaited<
  ReturnType<StripeClient['paymentIntents']['retrieve']>
>;
type StripePaymentIntentStatus = StripePaymentIntent['status'];

const STRIPE_API_VERSION = '2026-04-22.dahlia';
const DEFAULT_SINGLE_RIDE_AMOUNT_SATANG = 2500;
const SINGLE_RIDE_VALIDITY_MINUTES = 90;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private stripe?: StripeClient;

  constructor(private readonly prisma: PrismaService) {}

  async createPromptPayPayment(
    dto: CreatePromptPayPaymentDto,
    actorUserId?: string | null,
    actorSessionVersion?: string | number | null,
  ) {
    const actor = await resolveRequestActor(
      this.prisma,
      actorUserId,
      actorSessionVersion,
    );
    const product = this.getTicketProduct(dto.ticketType ?? 'SINGLE_RIDE');
    const stripe = this.getStripeClient();
    const publishableKey = this.getStripePublishableKey();

    const order = await this.prisma.ticketOrder.create({
      data: {
        userId: actor.id,
        amountSatang: product.amountSatang,
        currency: 'thb',
        productName: product.name,
        customerEmail: actor.email,
      },
      include: { ticket: true },
    });

    try {
      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: product.amountSatang,
          currency: 'thb',
          payment_method_types: ['promptpay'],
          description: `${product.name} (${order.id})`,
          receipt_email: actor.email,
          metadata: {
            orderId: order.id,
            userId: actor.id,
            ticketType: product.type,
          },
        },
        {
          idempotencyKey: `busbuddy-ticket-order-${order.id}`,
        },
      );

      const updatedOrder = await this.prisma.ticketOrder.update({
        where: { id: order.id },
        data: {
          stripePaymentIntentId: paymentIntent.id,
          stripePaymentStatus: paymentIntent.status,
          status: this.mapStripePaymentIntentStatus(paymentIntent.status),
        },
        include: { ticket: true },
      });

      return {
        ...this.toOrderResponse(updatedOrder),
        clientSecret: paymentIntent.client_secret,
        publishableKey,
      };
    } catch (error) {
      await this.prisma.ticketOrder.update({
        where: { id: order.id },
        data: {
          status: 'FAILED',
          failureMessage:
            error instanceof Error
              ? error.message
              : 'Unable to create PromptPay payment.',
        },
      });
      this.logger.error(
        'Unable to create PromptPay PaymentIntent.',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'Unable to start PromptPay payment.',
      );
    }
  }

  async getOrder(
    orderId: string,
    actorUserId?: string | null,
    actorSessionVersion?: string | number | null,
  ) {
    const actor = await resolveRequestActor(
      this.prisma,
      actorUserId,
      actorSessionVersion,
    );
    const order = await this.prisma.ticketOrder.findUnique({
      where: { id: orderId },
      include: { ticket: true },
    });

    if (!order || (order.userId !== actor.id && actor.role !== 'ADMIN')) {
      throw new NotFoundException('Ticket order was not found.');
    }

    if (order.stripePaymentIntentId && !this.isTerminalOrderStatus(order.status)) {
      const paymentIntent = await this.getStripeClient().paymentIntents.retrieve(
        order.stripePaymentIntentId,
      );
      const syncedOrder = await this.syncPaymentIntent(paymentIntent);

      if (syncedOrder) {
        return this.toOrderResponse(syncedOrder);
      }
    }

    return this.toOrderResponse(order);
  }

  async handleStripeWebhook(rawBody?: Buffer, signature?: string) {
    if (!rawBody || !signature) {
      throw new BadRequestException('Missing Stripe webhook payload.');
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new ServiceUnavailableException(
        'Stripe webhook secret is not configured.',
      );
    }

    let event: StripeEvent;

    try {
      event = this.getStripeClient().webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Invalid Stripe webhook signature.',
      );
    }

    if (
      event.type === 'payment_intent.succeeded' ||
      event.type === 'payment_intent.processing' ||
      event.type === 'payment_intent.payment_failed' ||
      event.type === 'payment_intent.canceled' ||
      event.type === 'payment_intent.requires_action'
    ) {
      await this.syncPaymentIntent(event.data.object as StripePaymentIntent);
    }

    return { received: true };
  }

  private async syncPaymentIntent(paymentIntent: StripePaymentIntent) {
    const orderId =
      typeof paymentIntent.metadata?.orderId === 'string'
        ? paymentIntent.metadata.orderId
        : undefined;

    const where = orderId
      ? { id: orderId }
      : { stripePaymentIntentId: paymentIntent.id };

    const existingOrder = await this.prisma.ticketOrder.findFirst({
      where,
      include: { ticket: true },
    });

    if (!existingOrder) {
      this.logger.warn(
        `Ignoring Stripe event for unknown PaymentIntent ${paymentIntent.id}.`,
      );
      return null;
    }

    const nextStatus = this.mapStripePaymentIntentStatus(paymentIntent.status);
    const failureMessage =
      paymentIntent.last_payment_error?.message ??
      (nextStatus === 'FAILED' ? 'PromptPay payment failed.' : null);

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.ticketOrder.update({
        where: { id: existingOrder.id },
        data: {
          status: nextStatus,
          stripePaymentIntentId: paymentIntent.id,
          stripePaymentStatus: paymentIntent.status,
          failureMessage,
          paidAt: nextStatus === 'PAID' ? existingOrder.paidAt ?? new Date() : undefined,
        },
        include: { ticket: true },
      });

      if (nextStatus === 'PAID') {
        await tx.ticket.upsert({
          where: { orderId: order.id },
          update: {},
          create: {
            orderId: order.id,
            userId: order.userId,
            displayCode: this.generateTicketCode(order.id),
            validUntil: new Date(
              Date.now() + SINGLE_RIDE_VALIDITY_MINUTES * 60 * 1000,
            ),
          },
        });
      }

      return tx.ticketOrder.findUnique({
        where: { id: order.id },
        include: { ticket: true },
      });
    });
  }

  private getTicketProduct(type: TicketProductType) {
    if (type !== 'SINGLE_RIDE') {
      throw new BadRequestException('Unsupported ticket type.');
    }

    const amountSatang = Number(
      process.env.STRIPE_PROMPTPAY_TICKET_AMOUNT_SATANG ??
        DEFAULT_SINGLE_RIDE_AMOUNT_SATANG,
    );

    if (!Number.isInteger(amountSatang) || amountSatang <= 0) {
      throw new ServiceUnavailableException(
        'PromptPay ticket amount is not configured correctly.',
      );
    }

    return {
      type,
      name: 'BusBuddy Single Ride Ticket',
      amountSatang,
    };
  }

  private getStripeClient() {
    if (this.stripe) {
      return this.stripe;
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      throw new ServiceUnavailableException(
        'Stripe secret key is not configured.',
      );
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: STRIPE_API_VERSION,
    });

    return this.stripe;
  }

  private getStripePublishableKey() {
    const publishableKey =
      process.env.STRIPE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

    if (!publishableKey) {
      throw new ServiceUnavailableException(
        'Stripe publishable key is not configured.',
      );
    }

    return publishableKey;
  }

  private mapStripePaymentIntentStatus(
    status: StripePaymentIntentStatus,
  ): TicketOrderStatus {
    switch (status) {
      case 'succeeded':
        return 'PAID';
      case 'processing':
        return 'PROCESSING';
      case 'requires_action':
        return 'REQUIRES_ACTION';
      case 'canceled':
        return 'CANCELED';
      case 'requires_payment_method':
        return 'FAILED';
      default:
        return 'PENDING';
    }
  }

  private isTerminalOrderStatus(status: TicketOrderStatus) {
    return status === 'PAID' || status === 'FAILED' || status === 'CANCELED';
  }

  private generateTicketCode(orderId: string) {
    return `BB-${orderId.slice(0, 8).toUpperCase()}-${Date.now()
      .toString(36)
      .slice(-4)
      .toUpperCase()}`;
  }

  private toOrderResponse(order: TicketOrderWithTicket) {
    return {
      id: order.id,
      amountSatang: order.amountSatang,
      amountDisplay: new Intl.NumberFormat('th-TH', {
        style: 'currency',
        currency: 'THB',
      }).format(order.amountSatang / 100),
      currency: order.currency,
      productName: order.productName,
      status: order.status,
      stripePaymentStatus: order.stripePaymentStatus,
      customerEmail: order.customerEmail,
      failureMessage: order.failureMessage,
      paidAt: order.paidAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      ticket: order.ticket
        ? {
            id: order.ticket.id,
            displayCode: order.ticket.displayCode,
            status: order.ticket.status,
            validFrom: order.ticket.validFrom.toISOString(),
            validUntil: order.ticket.validUntil.toISOString(),
          }
        : null,
    };
  }
}
