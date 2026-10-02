import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Length } from 'class-validator';
import { IsSafeText } from '../../../infra/security/validators/is-safe-text.decorator';
import { IsCreditCardOrSandbox } from '../../../infra/security/validators/is-credit-card-or-sandbox.decorator';

export class CreditCardDto {
  @ApiProperty({ description: 'Nome impresso no cartão', example: 'JOHN DOE' })
  @IsString()
  @IsNotEmpty()
  @IsSafeText()
  holderName: string;

  @ApiProperty({
    description:
      'Número do cartão de crédito (sem espaços ou traços). No ambiente Sandbox do Asaas, aceita o cartão de homologação 4444 4444 4444 4444.',
    example: '4111111111111111',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s.-]+/g, '') : value))
  @IsCreditCardOrSandbox()
  number: string;

  @ApiProperty({ description: 'Mês de expiração (MM)', example: '12' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 2)
  expiryMonth: string;

  @ApiProperty({ description: 'Ano de expiração (AAAA)', example: '2028' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(4, 4)
  expiryYear: string;

  @ApiProperty({ description: 'Código de segurança (CCV)', example: '123' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(3, 4)
  ccv: string;
}

