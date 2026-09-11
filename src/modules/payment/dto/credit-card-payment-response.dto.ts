import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreditCardPaymentResponseDto {
  @ApiProperty({ example: 'e5c2029b-88b7-4f6c-9463-b8c73229b999' })
  id: string;

  @ApiProperty({ example: 'd3b07384-d113-469b-b51f-5e488d5e1b20' })
  customerId: string;

  @ApiPropertyOptional({ example: 'pay_080225913253', nullable: true })
  asaasPaymentId?: string | null;

  @ApiProperty({ example: 'CREDIT_CARD' })
  billingType: string;

  @ApiProperty({ example: 'CONFIRMED', enum: ['RECEIVED', 'PROCESSING', 'CONFIRMED', 'FAILED'] })
  status: string;

  @ApiProperty({ example: 300.0 })
  value: number;

  @ApiPropertyOptional({ example: 288.5, nullable: true })
  netValue?: number | null;

  @ApiPropertyOptional({ example: 'https://sandbox.asaas.com/i/080225913253', nullable: true })
  invoiceUrl?: string | null;

  @ApiPropertyOptional({ example: 'order_uuid_2048', nullable: true })
  externalReference?: string | null;

  @ApiPropertyOptional({ example: 'VISA', nullable: true })
  creditCardBrand?: string | null;

  @ApiPropertyOptional({ example: '1111', nullable: true })
  creditCardLast4?: string | null;

  @ApiPropertyOptional({ example: '3673f47e-7517-4852-a548-5221081a9fd2', nullable: true })
  creditCardToken?: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  failureReason?: string | null;

  @ApiProperty({ example: '2026-09-10T15:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-10T15:30:02.000Z' })
  updatedAt: Date;
}
