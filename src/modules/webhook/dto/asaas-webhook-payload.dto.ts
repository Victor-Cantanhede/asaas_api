import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AsaasWebhookPayloadDto {
  @ApiPropertyOptional({ description: 'ID do evento do Asaas', example: 'evt_080225913252a' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ description: 'Tipo do evento', example: 'PAYMENT_RECEIVED' })
  @IsString()
  @IsNotEmpty()
  event: string;

  @ApiPropertyOptional({ description: 'Data de criação do evento no Asaas', example: '2026-09-29 17:25:12' })
  @IsOptional()
  @IsString()
  dateCreated?: string;

  @ApiPropertyOptional({ description: 'Objeto da conta/subconta Asaas vinculada ao evento' })
  @IsOptional()
  account?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Objeto de pagamento associado' })
  @IsOptional()
  payment?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Objeto de assinatura associado' })
  @IsOptional()
  subscription?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Objeto de transferência associada' })
  @IsOptional()
  transfer?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Objeto de antecipação associada' })
  @IsOptional()
  anticipation?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Objeto de nota fiscal/fatura municipal' })
  @IsOptional()
  invoice?: Record<string, any>;
}
