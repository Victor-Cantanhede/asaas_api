import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIP,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CreditCardDto } from '../../payment/dto/credit-card.dto';
import { CreditCardHolderInfoDto } from '../../payment/dto/credit-card-holder-info.dto';
import { IsSafeText } from '../../../infra/security/validators/is-safe-text.decorator';

export const SUBSCRIPTION_CYCLES = [
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'BIMONTHLY',
  'QUARTERLY',
  'SEMIANNUALLY',
  'YEARLY',
] as const;

export type SubscriptionCycle = (typeof SUBSCRIPTION_CYCLES)[number];

export class CreateSubscriptionDto {
  @ApiProperty({ description: 'ID local do Customer ou externalId', example: 'user_uuid_123' })
  @IsString()
  @IsNotEmpty()
  @IsSafeText()
  customerId: string;

  @ApiProperty({ description: 'Valor da recorrência em Reais', example: 59.9 })
  @IsNumber()
  @IsPositive()
  value: number;

  @ApiProperty({
    description: 'Ciclo de cobrança',
    enum: SUBSCRIPTION_CYCLES,
    default: 'MONTHLY',
    example: 'MONTHLY',
  })
  @IsEnum(SUBSCRIPTION_CYCLES)
  cycle: string = 'MONTHLY';

  @ApiPropertyOptional({ description: 'Data da primeira cobrança (YYYY-MM-DD)', example: '2026-10-10' })
  @IsOptional()
  @IsString()
  nextDueDate?: string;

  @ApiPropertyOptional({ description: 'Descrição da assinatura', example: 'Assinatura Plano Pro' })
  @IsOptional()
  @IsString()
  @IsSafeText()
  description?: string;

  @ApiPropertyOptional({ description: 'Referência externa', example: 'sub_ref_1001' })
  @IsOptional()
  @IsString()
  @IsSafeText()
  externalReference?: string;

  @ApiProperty({ description: 'IP do pagador (antifraude Asaas)', example: '187.12.34.56' })
  @IsIP()
  remoteIp: string;

  @ApiPropertyOptional({
    description:
      '[Legado/Fallback] Dados do cartão de crédito. Se fornecidos, são automaticamente protegidos por envelope criptográfico AES-256-GCM em trânsito no broker.',
    type: CreditCardDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreditCardDto)
  creditCard?: CreditCardDto;

  @ApiPropertyOptional({
    description:
      '[Recomendado PCI-DSS] Token de cartão gerado previamente no frontend via SDK Asaas. Reduz o escopo PCI e elimina manipulação de dados sensíveis.',
    example: '3673f47e-7517-4852-a548-5221081a9fd2',
  })
  @IsOptional()
  @IsString()
  creditCardToken?: string;

  @ApiPropertyOptional({ description: 'Dados do titular', type: CreditCardHolderInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreditCardHolderInfoDto)
  creditCardHolderInfo?: CreditCardHolderInfoDto;
}
