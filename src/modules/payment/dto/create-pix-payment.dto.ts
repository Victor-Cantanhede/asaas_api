import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PaymentSplitDto } from './payment-split.dto';
import { IsSafeText } from '../../../infra/security/validators/is-safe-text.decorator';

export class CreatePixPaymentDto {
  @ApiProperty({
    description: 'ID local do Customer ou externalId do cliente',
    example: 'user_uuid_123',
  })
  @IsString()
  @IsNotEmpty()
  @IsSafeText()
  customerId: string;

  @ApiProperty({ description: 'Valor da cobrança em Reais', example: 150.0 })
  @IsNumber()
  @IsPositive()
  value: number;

  @ApiPropertyOptional({
    description: 'Data de vencimento (YYYY-MM-DD). Se omitido, assume D+1',
    example: '2026-09-15',
  })
  @IsOptional()
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional({
    description: 'Descrição da cobrança exibida ao pagador',
    example: 'Pedido #1024',
  })
  @IsOptional()
  @IsString()
  @IsSafeText()
  description?: string;

  @ApiPropertyOptional({
    description: 'ID de referência externa (ex: orderId)',
    example: 'order_uuid_1024',
  })
  @IsOptional()
  @IsString()
  @IsSafeText()
  externalReference?: string;

  @ApiPropertyOptional({
    description: 'Regras de split de pagamento',
    type: [PaymentSplitDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentSplitDto)
  split?: PaymentSplitDto[];
}
