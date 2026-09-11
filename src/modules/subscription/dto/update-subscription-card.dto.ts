import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIP, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CreditCardDto } from '../../payment/dto/credit-card.dto';
import { CreditCardHolderInfoDto } from '../../payment/dto/credit-card-holder-info.dto';

export class UpdateSubscriptionCardDto {
  @ApiProperty({ description: 'IP do cliente pagador', example: '187.12.34.56' })
  @IsIP()
  remoteIp: string;

  @ApiPropertyOptional({
    description:
      '[Legado/Fallback] Novos dados do cartão de crédito. Criptografados via AES-256-GCM em trânsito no RabbitMQ.',
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
      '[Recomendado PCI-DSS] Novo token de cartão de crédito pré-existente tokenizado no frontend via SDK Asaas.',
    example: '3673f47e-7517-4852-a548-5221081a9fd2',
  })
  @IsOptional()
  @IsString()
  creditCardToken?: string;
}
