import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIP,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreditCardDto } from './credit-card.dto';
import { CreditCardHolderInfoDto } from './credit-card-holder-info.dto';
import { PaymentSplitDto } from './payment-split.dto';
import { IsSafeText } from '../../../infra/security/validators/is-safe-text.decorator';

export class CreateCreditCardPaymentDto {
  @ApiProperty({ description: 'ID local do Customer ou externalId', example: 'user_uuid_123' })
  @IsString()
  @IsNotEmpty()
  @IsSafeText()
  customerId: string;

  @ApiProperty({ description: 'Valor total da cobrança em Reais', example: 300.0 })
  @IsNumber()
  @IsPositive()
  value: number;

  @ApiProperty({
    description: 'IP do cliente pagador (antifraude obrigatório do Asaas)',
    example: '187.12.34.56',
  })
  @IsIP()
  remoteIp: string;

  @ApiPropertyOptional({ description: 'Quantidade de parcelas (1 a 12)', default: 1, example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  installmentCount?: number;

  @ApiPropertyOptional({ description: 'Data de vencimento (YYYY-MM-DD)', example: '2026-09-10' })
  @IsOptional()
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Descrição da cobrança', example: 'Compra #2048' })
  @IsOptional()
  @IsString()
  @IsSafeText()
  description?: string;

  @ApiPropertyOptional({ description: 'Referência externa', example: 'order_uuid_2048' })
  @IsOptional()
  @IsString()
  @IsSafeText()
  externalReference?: string;

  @ApiPropertyOptional({
    description:
      '[Legado/Fallback] Dados brutos do cartão de crédito. Se fornecidos, são automaticamente protegidos por envelope criptográfico AES-256-GCM antes de transitar nas filas do RabbitMQ.',
    type: CreditCardDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreditCardDto)
  creditCard?: CreditCardDto;

  @ApiPropertyOptional({ description: 'Dados do titular do cartão', type: CreditCardHolderInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreditCardHolderInfoDto)
  creditCardHolderInfo?: CreditCardHolderInfoDto;

  @ApiPropertyOptional({
    description:
      '[Recomendado PCI-DSS] Token de cartão gerado previamente no frontend via SDK Asaas. Reduz o escopo PCI e elimina a manipulação de PAN/CVV pelo backend.',
    example: '3673f47e-7517-4852-a548-5221081a9fd2',
  })
  @IsOptional()
  @IsString()
  creditCardToken?: string;

  @ApiPropertyOptional({ description: 'Regras de split de pagamento', type: [PaymentSplitDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentSplitDto)
  split?: PaymentSplitDto[];
}
