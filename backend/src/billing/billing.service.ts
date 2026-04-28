import {
  BadRequestException,
  ForbiddenException,
  HttpException,
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
type StripeCheckoutSessionCreateParams = NonNullable<
  Parameters<StripeClient['checkout']['sessions']['create']>[0]
>;
type StripeCheckoutLineItem = NonNullable<
  StripeCheckoutSessionCreateParams['line_items']
>[number];
type StripeSubscriptionStatus = StripeSubscription['status'];
type PremiumCheckoutPlan = 'tourist_weekly' | 'monthly';

const STRIPE_API_VERSION = '2026-04-22.dahlia';
const PREMIUM_ACTIVE_STATUSES: PremiumSubscriptionStatus[] = [
  'ACTIVE',
  'TRIALING',
];
const TOURIST_WEEKLY_PLAN: PremiumCheckoutPlan = 'tourist_weekly';
const MONTHLY_PLAN: PremiumCheckoutPlan = 'monthly';
const TOURIST_WEEKLY_DAYS = 7;

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
    requestedPlan?: string | null,
    actorUserId?: string | null,
    actorSessionVersion?: string | number | null,
  ) {
    const actor = await resolveRequestActor(
      this.prisma,
      actorUserId,
      actorSessionVersion,
    );
    const plan = this.normalizeCheckoutPlan(requestedPlan);
    const currentSubscription = await this.prisma.premiumSubscription.findUnique({
      where: { userId: actor.id },
    });

    if (this.isPremiumSubscription(currentSubscription)) {
      throw new BadRequestException(
        'This account already has an active Premium plan.',
      );
    }

    let session: Awaited<
      ReturnType<StripeClient['checkout']['sessions']['create']>
    >;

    try {
      const stripe = this.getStripeClient();
      const customerId = await this.getOrCreateStripeCustomer(actor.id);
      const appUrl = this.getAppUrl();

      session = await stripe.checkout.sessions.create({
        mode: plan === TOURIST_WEEKLY_PLAN ? 'payment' : 'subscription',
        customer: customerId,
        payment_method_types: ['card'],
        client_reference_id: actor.id,
        line_items: [this.getPremiumCheckoutLineItem(plan)],
        allow_promotion_codes: true,
        metadata: {
          userId: actor.id,
          plan,
        },
        subscription_data:
          plan === MONTHLY_PLAN
            ? {
                metadata: {
                  userId: actor.id,
                  plan,
                },
              }
            : undefined,
        payment_intent_data:
          plan === TOURIST_WEEKLY_PLAN
            ? {
                metadata: {
                  userId: actor.id,
                  plan,
                },
              }
            : undefined,
        success_url: `${appUrl}/premium?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/premium?checkout=cancelled`,
      });
    } catch (error) {
      throw this.toBillingException(error, 'Unable to start Stripe Checkout.');
    }

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

  async syncCheckoutSessionById(
    sessionId?: string | null,
    actorUserId?: string | null,
    actorSessionVersion?: string | number | null,
  ) {
    if (!sessionId) {
      throw new BadRequestException('Stripe Checkout Session ID is required.');
    }

    const actor = await resolveRequestActor(
      this.prisma,
      actorUserId,
      actorSessionVersion,
    );
    let session: StripeCheckoutSession;

    try {
      session = await this.getStripeClient().checkout.sessions.retrieve(
        sessionId,
      );
    } catch (error) {
      throw this.toBillingException(
        error,
        'Unable to load Stripe Checkout Session.',
      );
    }

    const sessionUserId = session.client_reference_id ?? session.metadata?.userId;

    if (sessionUserId !== actor.id) {
      throw new ForbiddenException(
        'This Stripe Checkout Session does not belong to the current user.',
      );
    }

    if (session.payment_status !== 'paid') {
      throw new BadRequestException(
        'Stripe Checkout Session has not completed payment yet.',
      );
    }

    await this.syncCheckoutSession(session);
    const subscription = await this.prisma.premiumSubscription.findUnique({
      where: { userId: actor.id },
    });

    return this.toBillingStatusResponse(subscription);
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
    const stripeCustomerId = user?.stripeCustomerId ?? null;

    if (!this.isStripeCustomerId(stripeCustomerId)) {
      throw new BadRequestException(
        'No Stripe customer exists for this account.',
      );
    }

    let session: Awaited<
      ReturnType<StripeClient['billingPortal']['sessions']['create']>
    >;

    try {
      session = await this.getStripeClient().billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${this.getAppUrl()}/premium`,
      });
    } catch (error) {
      throw this.toBillingException(
        error,
        'Unable to open the Stripe customer portal.',
      );
    }

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
      if (session.payment_status === 'paid') {
        await this.grantTouristWeeklyPass(session);
        return;
      }

      this.logger.warn(`Ignoring unpaid Checkout Session ${session.id}.`);
      return null;
    }

    const subscription = await this.getStripeClient().subscriptions.retrieve(
      subscriptionId,
    );
    await this.syncSubscription(subscription, {
      userId: session.client_reference_id ?? session.metadata?.userId,
      customerId: this.getId(session.customer),
    });
  }

  private async grantTouristWeeklyPass(session: StripeCheckoutSession) {
    const plan = this.normalizeCheckoutPlan(session.metadata?.plan);

    if (plan !== TOURIST_WEEKLY_PLAN) {
      this.logger.warn(
        `Ignoring one-time Checkout Session ${session.id} for unsupported plan ${session.metadata?.plan ?? 'unknown'}.`,
      );
      return null;
    }

    const customerId = this.getId(session.customer);

    if (!customerId) {
      this.logger.warn(
        `Ignoring weekly pass Checkout Session ${session.id} without a customer.`,
      );
      return null;
    }

    const userId =
      session.client_reference_id ??
      session.metadata?.userId ??
      (await this.findUserIdByStripeCustomer(customerId));

    if (!userId) {
      this.logger.warn(
        `Ignoring weekly pass Checkout Session ${session.id}; no BusBuddy user found.`,
      );
      return null;
    }

    const now = new Date();
    const existingSubscription = await this.prisma.premiumSubscription.findUnique({
      where: { userId },
    });
    const baseStart =
      existingSubscription?.currentPeriodEnd &&
      existingSubscription.currentPeriodEnd.getTime() > now.getTime()
        ? existingSubscription.currentPeriodEnd
        : now;
    const currentPeriodEnd = new Date(
      baseStart.getTime() + TOURIST_WEEKLY_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customerId },
    });

    return this.prisma.premiumSubscription.upsert({
      where: { userId },
      update: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: `weekly_${session.id}`,
        stripePriceId: TOURIST_WEEKLY_PLAN,
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd,
        trialEndsAt: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        latestInvoiceId: this.getId(session.payment_intent),
        latestPaymentStatus: session.payment_status,
      },
      create: {
        userId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: `weekly_${session.id}`,
        stripePriceId: TOURIST_WEEKLY_PLAN,
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd,
        trialEndsAt: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        latestInvoiceId: this.getId(session.payment_intent),
        latestPaymentStatus: session.payment_status,
      },
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

  private async getOrCreateStripeCustomer(userId: string): Promise<string> {
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

    if (this.isStripeCustomerId(user.stripeCustomerId)) {
      try {
        const customer = await this.getStripeClient().customers.retrieve(
          user.stripeCustomerId,
        );

        if (!('deleted' in customer && customer.deleted)) {
          return user.stripeCustomerId;
        }

        this.logger.warn(
          `Stripe customer ${user.stripeCustomerId} was deleted; creating a new one for user ${user.id}.`,
        );
      } catch (error) {
        if (!this.isMissingStripeResource(error)) {
          throw this.toBillingException(
            error,
            'Unable to verify Stripe customer.',
          );
        }

        this.logger.warn(
          `Stripe customer ${user.stripeCustomerId} was not found; creating a new one for user ${user.id}.`,
        );
      }
    } else if (user.stripeCustomerId) {
      this.logger.warn(
        `Ignoring stale non-Stripe customer ID ${user.stripeCustomerId} for user ${user.id}.`,
      );
    }

    let customer: Awaited<ReturnType<StripeClient['customers']['create']>>;

    try {
      customer = await this.getStripeClient().customers.create({
        email: user.email,
        name: user.name ?? undefined,
        metadata: {
          userId: user.id,
        },
      });
    } catch (error) {
      throw this.toBillingException(
        error,
        'Unable to create Stripe customer.',
      );
    }

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
          stripeSubscriptionId?: string | null;
          stripePriceId?: string | null;
          currentPeriodEnd: Date | null;
          cancelAtPeriodEnd: boolean;
          trialEndsAt: Date | null;
        }
      | null,
  ) {
    const plan = this.getPremiumPlan(subscription);

    return {
      isPremium: this.isPremiumSubscription(subscription),
      status: subscription?.status ?? null,
      plan,
      currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
    };
  }

  private isPremiumSubscription(
    subscription:
      | {
          status: PremiumSubscriptionStatus;
          stripeSubscriptionId?: string | null;
          currentPeriodEnd: Date | null;
        }
      | null,
  ) {
    if (
      !subscription ||
      !PREMIUM_ACTIVE_STATUSES.includes(subscription.status) ||
      subscription.stripeSubscriptionId?.startsWith('qr_')
    ) {
      return false;
    }

    if (!subscription.currentPeriodEnd) {
      return true;
    }

    return subscription.currentPeriodEnd.getTime() > Date.now();
  }

  private getPremiumPlan(
    subscription:
      | {
          stripeSubscriptionId?: string | null;
          stripePriceId?: string | null;
        }
      | null,
  ): PremiumCheckoutPlan | 'unknown' | null {
    if (!subscription) {
      return null;
    }

    if (
      subscription.stripePriceId === TOURIST_WEEKLY_PLAN ||
      subscription.stripeSubscriptionId?.startsWith('weekly_')
    ) {
      return TOURIST_WEEKLY_PLAN;
    }

    if (subscription.stripeSubscriptionId?.startsWith('sub_')) {
      return MONTHLY_PLAN;
    }

    return subscription.stripePriceId ? 'unknown' : null;
  }

  private getPremiumCheckoutLineItem(plan: PremiumCheckoutPlan): StripeCheckoutLineItem {
    const priceId =
      plan === TOURIST_WEEKLY_PLAN
        ? process.env.STRIPE_TOURIST_WEEKLY_PRICE_ID
        : process.env.STRIPE_PREMIUM_PRICE_ID;

    if (priceId) {
      return {
        price: priceId,
        quantity: 1,
      };
    }

    return {
      price_data: {
        currency: (process.env.STRIPE_PREMIUM_CURRENCY ?? 'thb').toLowerCase(),
        product_data: {
          name:
            plan === TOURIST_WEEKLY_PLAN
              ? 'BusBuddy Tourist Premium Pass'
              : 'BusBuddy Premium Monthly',
          description:
            plan === TOURIST_WEEKLY_PLAN
              ? 'A 7-day Premium pass for visitors traveling around Thailand.'
              : 'Full AI assistant, multiple alerts, unlimited favorites, and advanced trip planning.',
        },
        recurring:
          plan === MONTHLY_PLAN
            ? {
                interval: 'month',
              }
            : undefined,
        unit_amount:
          plan === TOURIST_WEEKLY_PLAN
            ? this.getPremiumWeeklyUnitAmount()
            : this.getPremiumMonthlyUnitAmount(),
      },
      quantity: 1,
    };
  }

  private normalizeCheckoutPlan(plan?: string | null): PremiumCheckoutPlan {
    return plan === TOURIST_WEEKLY_PLAN ? TOURIST_WEEKLY_PLAN : MONTHLY_PLAN;
  }

  private getPremiumMonthlyUnitAmount() {
    const amountThb = Number(process.env.PREMIUM_MONTHLY_PRICE_THB ?? 99);
    const safeAmountThb =
      Number.isFinite(amountThb) && amountThb > 0 ? amountThb : 99;
    return Math.round(safeAmountThb * 100);
  }

  private getPremiumWeeklyUnitAmount() {
    const amountThb = Number(process.env.PREMIUM_WEEKLY_PRICE_THB ?? 39);
    const safeAmountThb =
      Number.isFinite(amountThb) && amountThb > 0 ? amountThb : 39;
    return Math.round(safeAmountThb * 100);
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

  private isStripeCustomerId(customerId?: string | null): customerId is string {
    return Boolean(customerId?.startsWith('cus_'));
  }

  private isMissingStripeResource(error: unknown) {
    return (
      this.getStripeErrorCode(error) === 'resource_missing' ||
      this.getErrorMessage(error).toLowerCase().includes('no such customer')
    );
  }

  private toBillingException(error: unknown, fallbackMessage: string) {
    if (error instanceof HttpException) {
      return error;
    }

    const message = this.getErrorMessage(error) || fallbackMessage;
    const type = this.getStripeErrorType(error);

    this.logger.error(message);

    if (type === 'StripeAuthenticationError') {
      return new ServiceUnavailableException(
        'Stripe authentication failed. Check STRIPE_SECRET_KEY.',
      );
    }

    if (type === 'StripeConnectionError' || type === 'StripeAPIError') {
      return new ServiceUnavailableException(message);
    }

    return new BadRequestException(message);
  }

  private getStripeErrorType(error: unknown) {
    return typeof error === 'object' && error && 'type' in error
      ? String(error.type)
      : '';
  }

  private getStripeErrorCode(error: unknown) {
    return typeof error === 'object' && error && 'code' in error
      ? String(error.code)
      : '';
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : '';
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
