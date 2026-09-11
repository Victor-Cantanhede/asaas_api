import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AsaasWebhookPayloadDto {
  @ApiProperty({ description: 'ID do evento do Asaas', example: 'evt_080225913252a' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'Tipo do evento', example: 'PAYMENT_RECEIVED' })
  @IsString()
  @IsNotEmpty()
  event: string;

  @ApiPropertyOptional({ description: 'Data de criação do evento no Asaas', example: '2026-09-10 14:35:00' })
  @IsOptional()
  @IsString()
  dateCreated?: string;

  @ApiPropertyOptional({ description: 'Objeto de pagamento associado' })
  @IsOptional()
  payment?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Objeto de assinatura associado' })
  @IsOptional()
  subscription?: Record<string, any>;
}
