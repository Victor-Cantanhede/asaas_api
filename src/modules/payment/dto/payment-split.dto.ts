import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';
import { IsSafeText } from '../../../infra/security/validators/is-safe-text.decorator';

export class PaymentSplitDto {
  @ApiPropertyOptional({
    description: 'ID da carteira Asaas destino do split (opcional se subaccountExternalId for informado)',
    example: 'bbf67496-1379-4b6d-a348-fd5fa229f1c',
  })
  @IsOptional()
  @IsString()
  walletId?: string;

  @ApiPropertyOptional({
    description: 'ID de referência externa da subconta do parceiro (DX facilitada: dispensa busca manual de walletId)',
    example: 'freelancer_usr_123',
  })
  @IsOptional()
  @IsString()
  @IsSafeText()
  subaccountExternalId?: string;

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
