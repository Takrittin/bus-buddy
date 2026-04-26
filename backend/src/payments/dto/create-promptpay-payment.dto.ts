import { IsIn, IsOptional } from 'class-validator';

export const TICKET_PRODUCT_TYPES = ['SINGLE_RIDE'] as const;

export type TicketProductType = (typeof TICKET_PRODUCT_TYPES)[number];

export class CreatePromptPayPaymentDto {
  @IsOptional()
  @IsIn(TICKET_PRODUCT_TYPES)
  ticketType?: TicketProductType;
}
