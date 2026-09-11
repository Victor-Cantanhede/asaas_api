import { ApiProperty } from '@nestjs/swagger';
import { IsCreditCard, IsNotEmpty, IsString, Length } from 'class-validator';
import { IsSafeText } from '../../../infra/security/validators/is-safe-text.decorator';

export class CreditCardDto {
  @ApiProperty({ description: 'Nome impresso no cartão', example: 'JOHN DOE' })
  @IsString()
  @IsNotEmpty()
  @IsSafeText()
  holderName: string;

  @ApiProperty({ description: 'Número do cartão de crédito (sem espaços ou traços)', example: '4111111111111111' })
  @IsCreditCard()
  number: string;

  @ApiProperty({ description: 'Mês de expiração (MM)', example: '12' })
  @IsString()
  @Length(2, 2)
  expiryMonth: string;

  @ApiProperty({ description: 'Ano de expiração (AAAA)', example: '2028' })
  @IsString()
  @Length(4, 4)
  expiryYear: string;

  @ApiProperty({ description: 'Código de segurança (CCV)', example: '123' })
  @IsString()
  @Length(3, 4)
  ccv: string;
}
