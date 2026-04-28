import { IsIn, IsOptional, IsString } from 'class-validator';

const PREMIUM_GRANT_PLANS = ['tourist_weekly', 'monthly'] as const;

export type PremiumGrantPlan = (typeof PREMIUM_GRANT_PLANS)[number];

export class GrantPremiumUserDto {
  @IsIn(PREMIUM_GRANT_PLANS)
  plan!: PremiumGrantPlan;

  @IsString()
  @IsOptional()
  reason?: string;
}
