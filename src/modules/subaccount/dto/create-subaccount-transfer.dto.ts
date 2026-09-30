import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { IsSafeText } from '../../../infra/security/validators/is-safe-text.decorator';

export class SubaccountBankAccountDto {
  @ApiProperty({ description: 'Código COMPE de 3 dígitos do banco destino (ex: 260 para Nubank, 001 para BB)', example: '260' })
  @IsString()
  @IsNotEmpty()
  @IsSafeText()
  bankCode: string;

  @ApiProperty({ description: 'Agência bancária (sem dígito)', example: '0001' })
  @IsString()
  @IsNotEmpty()
  @IsSafeText()
  agency: string;

  @ApiProperty({ description: 'Número da conta bancária', example: '1234567' })
  @IsString()
  @IsNotEmpty()
  @IsSafeText()
  account: string;

  @ApiProperty({ description: 'Dígito verificador da conta', example: '8' })
  @IsString()
  @IsNotEmpty()
  @IsSafeText()
  accountDigit: string;

  @ApiProperty({ description: 'Tipo da conta bancária', enum: ['CONTA_CORRENTE', 'CONTA_POUPANCA'], example: 'CONTA_CORRENTE' })
  @IsEnum(['CONTA_CORRENTE', 'CONTA_POUPANCA'])
  bankAccountType: 'CONTA_CORRENTE' | 'CONTA_POUPANCA';

  @ApiProperty({ description: 'CPF ou CNPJ do titular da conta', example: '24971563792' })
  @IsString()
  @IsNotEmpty()
  @IsSafeText()
  cpfCnpj: string;

  @ApiProperty({ description: 'Nome completo ou Razão Social do titular', example: 'Carlos Silva' })
  @IsString()
  @IsNotEmpty()
  @IsSafeText()
  name: string;
}

export class CreateSubaccountTransferDto {
  @ApiProperty({ description: 'Valor a ser transferido/sacado da subconta (em Reais)', example: 100.0 })
  @IsNumber()
  @IsPositive()
  value: number;

  @ApiPropertyOptional({
    description: 'Chave PIX de destino (se a transferência for via PIX)',
    example: 'carlos.silva@email.com',
  })
  @IsOptional()
  @IsString()
  @IsSafeText()
  pixAddressKey?: string;

  @ApiPropertyOptional({
    description: 'Tipo da chave PIX',
    enum: ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'],
    example: 'EMAIL',
  })
  @IsOptional()
  @IsEnum(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'])
  pixAddressKeyType?: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';

  @ApiPropertyOptional({
    description: 'Dados bancários tradicionais para transferência (TED)',
    type: SubaccountBankAccountDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SubaccountBankAccountDto)
  bankAccount?: SubaccountBankAccountDto;

  @ApiPropertyOptional({
    description: 'Descrição ou identificador da transferência',
    example: 'Saque quinzenal comissão',
  })
  @IsOptional()
  @IsString()
  @IsSafeText()
  description?: string;
}
