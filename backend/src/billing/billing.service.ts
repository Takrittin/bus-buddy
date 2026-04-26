import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PremiumSubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';
import { resolveRequestActor } from '../common/request-actor';
import { PrismaService } from '../prisma/prisma.service';

type StripeClient = Stripe.Stripe;
type StripeEvent = ReturnType<StripeClient['webhooks']['constructEvent']>;
type StripeCheckoutSession = Awaited<
  ReturnType<StripeClient['checkout']['sessions']['retrieve']>
>;
type StripeSubscription = Awaited<
  ReturnType<StripeClient['subscriptions']['retrieve']>
>;
type StripeSubscriptionStatus = StripeSubscription['status'];

const STRIPE_API_VERSION = '2026-04-22.dahlia';
const PREMIUM_ACTIVE_STATUSES: PremiumSubscriptionStatus[] = [
  'ACTIVE',
  'TRIALING',
];

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe?: StripeClient;

  constructor(private readonly prisma: PrismaService) {}

  async getBillingStatus(
    actorUserId?: string | null,
    actorSessionVersion?: string | number | null,
  ) {
    const actor = await resolveRequestActor(
      this.prisma,
      actorUserId,
      actorSessionVersion,
    );
    const subscription = await this.prisma.premiumSubscription.findUnique({
      where: { userId: actor.id },
    });

    return this.toBillingStatusResponse(subscription);
  }

  async createCheckoutSession(
    actorUserId?: string | null,
    actorSessionVersion?: string | number | null,
  ) {
    const actor = await resolveRequestActor(
      this.prisma,
      actorUserId,
      actorSessionVersion,
    );
    const priceId = this.getPremiumPriceId();
    const stripe = this.getStripeClient();
    const customerId = await this.getOrCreateStripeCustomer(actor.id);
    const appUrl = this.getAppUrl();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: actor.id,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      metadata: {
        userId: actor.id,
        plan: 'premium',
      },
      subscription_data: {
        metadata: {
          userId: actor.id,
          plan: 'premium',
        },
      },
      success_url: `${appUrl}/premium?checkout=success`,
      cancel_url: `${appUrl}/premium?checkout=cancelled`,
    });

    if (!session.url) {
      throw new ServiceUnavailableException(
        'Stripe Checkout did not return a redirect URL.',
      );
    }

    return {
      sessionId: session.id,
      url: session.url,
    };
  }

  async createCustomerPortalSession(
    actorUserId?: string | null,
    actorSessionVersion?: string | number | null,
  ) {
    const actor = await resolveRequestActor(
      this.prisma,
      actorUserId,
      actorSessionVersion,
    );
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) {
      throw new BadRequestException('No Stripe customer exists for this account.');
    }

    const session = await this.getStripeClient().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${this.getAppUrl()}/premium`,
    });

    return {
      url: session.url,
    };
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

    await this.handleStripeEvent(event);

    return { received: true };
  }

  async assertPremiumAccess(
    actorUserId?: string | null,
    actorSessionVersion?: string | number | null,
  ) {
    const actor = await resolveRequestActor(
      this.prisma,
      actorUserId,
      actorSessionVersion,
    );

    if (actor.role === 'ADMIN' || actor.role === 'FLEET') {
      return actor;
    }

    const subscription = await this.prisma.premiumSubscription.findUnique({
      where: { userId: actor.id },
    });

    if (!this.isPremiumSubscription(subscription)) {
      throw new ForbiddenException(
        'BusBuddy Premium is required for this feature.',
      );
    }

    return actor;
  }

  private async handleStripeEvent(event: StripeEvent) {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.syncCheckoutSession(
          event.data.object as StripeCheckoutSession,
        );
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.syncSubscription(event.data.object as StripeSubscription);
        break;
      default:
        break;
    }
  }

  private async syncCheckoutSession(session: StripeCheckoutSession) {
    const subscriptionId = this.getId(session.subscription);

    if (!subscriptionId) {
      this.logger.warn(
        `Ignoring Checkout Session ${session.id} without a subscription.`,
      );
      return;
    }

    const subscription = await this.getStripeClient().subscriptions.retrieve(
      subscriptionId,
    );
    await this.syncSubscription(subscription, {
      userId: session.client_reference_id ?? session.metadata?.userId,
      customerId: this.getId(session.customer),
    });
  }

  private async syncSubscription(
    subscription: StripeSubscription,
    fallback?: { userId?: string | null; customerId?: string | null },
  ) {
    const customerId = this.getId(subscription.customer) ?? fallback?.customerId;

    if (!customerId) {
      this.logger.warn(
        `Ignoring subscription ${subscription.id} without a customer.`,
      );
      return null;
    }

    const userId =
      subscription.metadata?.userId ??
      fallback?.userId ??
      (await this.findUserIdByStripeCustomer(customerId));

    if (!userId) {
      this.logger.warn(
        `Ignoring subscription ${subscription.id}; no BusBuddy user found.`,
      );
      return null;
    }

    const firstItem = subscription.items.data[0];
    const latestInvoiceId = this.getId(subscription.latest_invoice);

    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customerId },
    });

    return this.prisma.premiumSubscription.upsert({
      where: { userId },
      update: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripePriceId: firstItem?.price?.id,
        status: this.mapSubscriptionStatus(subscription.status),
        currentPeriodStart: this.toDate(firstItem?.current_period_start),
        currentPeriodEnd: this.toDate(firstItem?.current_period_end),
        trialEndsAt: this.toDate(subscription.trial_end),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: this.toDate(subscription.canceled_at),
        latestInvoiceId,
        latestPaymentStatus: subscription.status,
      },
      create: {
        userId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripePriceId: firstItem?.price?.id,
        status: this.mapSubscriptionStatus(subscription.status),
        currentPeriodStart: this.toDate(firstItem?.current_period_start),
        currentPeriodEnd: this.toDate(firstItem?.current_period_end),
        trialEndsAt: this.toDate(subscription.trial_end),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: this.toDate(subscription.canceled_at),
        latestInvoiceId,
        latestPaymentStatus: subscription.status,
      },
    });
  }

  private async getOrCreateStripeCustomer(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        stripeCustomerId: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User account was not found.');
    }

    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    const customer = await this.getStripeClient().customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: {
        userId: user.id,
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  private async findUserIdByStripeCustomer(stripeCustomerId: string) {
    const user = await this.prisma.user.findUnique({
      where: { stripeCustomerId },
      select: { id: true },
    });

    return user?.id ?? null;
  }

  private toBillingStatusResponse(
    subscription:
      | {
          status: PremiumSubscriptionStatus;
          currentPeriodEnd: Date | null;
          cancelAtPeriodEnd: boolean;
          trialEndsAt: Date | null;
        }
      | null,
  ) {
    return {
      isPremium: this.isPremiumSubscription(subscription),
      status: subscription?.status ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
    };
  }

  private isPremiumSubscription(
    subscription:
      | {
          status: PremiumSubscriptionStatus;
          currentPeriodEnd: Date | null;
        }
      | null,
  ) {
    if (!subscription || !PREMIUM_ACTIVE_STATUSES.includes(subscription.status)) {
      return false;
    }

    if (!subscription.currentPeriodEnd) {
      return true;
    }

    return subscription.currentPeriodEnd.getTime() > Date.now();
  }

  private getPremiumPriceId() {
    const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;

    if (!priceId) {
      throw new ServiceUnavailableException(
        'Stripe premium price ID is not configured.',
      );
    }

    return priceId;
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

  private getAppUrl() {
    return (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  }

  private getId(value: string | { id: string } | null | undefined) {
    if (!value) {
      return null;
    }

    return typeof value === 'string' ? value : value.id;
  }

  private toDate(timestamp?: number | null) {
    return timestamp ? new Date(timestamp * 1000) : null;
  }

  private mapSubscriptionStatus(
    status: StripeSubscriptionStatus,
  ): PremiumSubscriptionStatus {
    switch (status) {
      case 'active':
        return 'ACTIVE';
      case 'trialing':
        return 'TRIALING';
      case 'past_due':
        return 'PAST_DUE';
      case 'canceled':
        return 'CANCELED';
      case 'unpaid':
        return 'UNPAID';
      case 'paused':
        return 'PAUSED';
      case 'incomplete_expired':
        return 'INCOMPLETE_EXPIRED';
      default:
        return 'INCOMPLETE';
    }
  }
}
