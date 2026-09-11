import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';
import { IsSafeText } from '../../../infra/security/validators/is-safe-text.decorator';

export class PaymentSplitDto {
  @ApiProperty({ description: 'ID da carteira Asaas destino do split', example: 'bbf67496-1379-4b6d-a348-fd5fa229f1c' })
  @IsString()
  @IsNotEmpty()
  walletId: string;

  @ApiPropertyOptional({ description: 'Valor fixo repassado à carteira', example: 30.0 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  fixedValue?: number;

  @ApiPropertyOptional({ description: 'Percentual sobre a cobrança (0.01 a 100)', example: 10.0 })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(100)
  percentualValue?: number;

  @ApiPropertyOptional({ description: 'Descrição interna do split', example: 'Comissão Parceiro' })
  @IsOptional()
  @IsString()
  @IsSafeText()
  description?: string;
}
