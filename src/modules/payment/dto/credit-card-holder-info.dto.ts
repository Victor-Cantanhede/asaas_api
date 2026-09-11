import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IsSafeText } from '../../../infra/security/validators/is-safe-text.decorator';

export class CreditCardHolderInfoDto {
  @ApiProperty({ description: 'Nome do titular do cartão', example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  @IsSafeText()
  name: string;

  @ApiProperty({ description: 'E-mail do titular do cartão', example: 'john.doe@asaas.com.br' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'CPF ou CNPJ do titular do cartão (apenas números)', example: '24971563792' })
  @IsString()
  @IsNotEmpty()
  cpfCnpj: string;

  @ApiProperty({ description: 'CEP do endereço do titular', example: '01310-000' })
  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @ApiProperty({ description: 'Número do endereço', example: '150' })
  @IsString()
  @IsNotEmpty()
  addressNumber: string;

  @ApiPropertyOptional({ description: 'Telefone com DDD', example: '4738010919' })
  @IsOptional()
  @IsString()
  phone?: string;
}
