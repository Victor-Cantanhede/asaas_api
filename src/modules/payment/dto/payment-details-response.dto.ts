import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaymentDetailsResponseDto {
  @ApiProperty({ example: 'b1b7029b-98b7-4f6c-8463-b8c73229b011' })
  id: string;

  @ApiProperty({ example: 'd3b07384-d113-469b-b51f-5e488d5e1b20' })
  customerId: string;

  @ApiPropertyOptional({ example: 'pay_080225913252', nullable: true })
  asaasPaymentId?: string | null;

  @ApiProperty({ example: 'PIX', enum: ['PIX', 'CREDIT_CARD'] })
  billingType: string;

  @ApiProperty({
    example: 'PENDING',
    enum: [
      'RECEIVED',
      'PROCESSING',
      'PENDING',
      'CONFIRMED',
      'RECEIVED_IN_CASH',
      'REFUNDED',
      'FAILED',
    ],
  })
  status: string;

  @ApiProperty({ example: 150.0 })
  value: number;

  @ApiPropertyOptional({ example: 148.01, nullable: true })
  netValue?: number | null;

  @ApiPropertyOptional({ example: '2026-09-15T00:00:00.000Z', nullable: true })
  dueDate?: Date | null;

  @ApiPropertyOptional({ example: '2026-09-15T14:30:00.000Z', nullable: true })
  paymentDate?: Date | null;

  @ApiPropertyOptional({
    example: 'https://sandbox.asaas.com/i/080225913252',
    nullable: true,
  })
  invoiceUrl?: string | null;

  @ApiPropertyOptional({ example: 'order_uuid_1024', nullable: true })
  externalReference?: string | null;

  @ApiPropertyOptional({ example: 'iVBORw0KGgoAAAANSUhEUgAAAMgAA...', nullable: true })
  pixQrCodeBase64?: string | null;

  @ApiPropertyOptional({
    example: '00020101021226730014br.gov.bcb.pix...',
    nullable: true,
  })
  pixPayload?: string | null;

  @ApiPropertyOptional({ example: '2026-09-15T23:59:59.000Z', nullable: true })
  pixExpirationDate?: Date | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  failureReason?: string | null;

  @ApiProperty({ example: '2026-09-10T15:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-10T15:30:02.000Z' })
  updatedAt: Date;
}
