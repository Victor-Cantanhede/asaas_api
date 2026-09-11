import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubscriptionResponseDto {
  @ApiProperty({ example: 'sub_local_uuid_456' })
  id: string;

  @ApiProperty({ example: 'cust_local_uuid_123' })
  customerId: string;

  @ApiPropertyOptional({ example: 'sub_000005401844', nullable: true })
  asaasSubscriptionId?: string | null;

  @ApiPropertyOptional({ example: 'sub_ref_1001', nullable: true })
  externalReference?: string | null;

  @ApiProperty({ example: 'CREDIT_CARD' })
  billingType: string;

  @ApiProperty({
    example: 'ACTIVE',
    enum: ['RECEIVED', 'PROCESSING', 'ACTIVE', 'INACTIVE', 'FAILED'],
  })
  status: string;

  @ApiProperty({ example: 'MONTHLY' })
  cycle: string;

  @ApiProperty({ example: 59.9 })
  value: number;

  @ApiPropertyOptional({ example: '2026-10-10T00:00:00.000Z', nullable: true })
  nextDueDate?: Date | null;

  @ApiPropertyOptional({ example: '3673f47e-7517-4852-a548-5221081a9fd2', nullable: true })
  creditCardToken?: string | null;

  @ApiPropertyOptional({ example: 'MASTERCARD', nullable: true })
  creditCardBrand?: string | null;

  @ApiPropertyOptional({ example: '4444', nullable: true })
  creditCardLast4?: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  failureReason?: string | null;

  @ApiProperty({ example: '2026-09-10T15:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-10T15:30:02.000Z' })
  updatedAt: Date;
}
