import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SanitizeText } from '../../../infra/security/decorators/sanitize-text.decorator';
import { IsSafeText } from '../../../infra/security/validators/is-safe-text.decorator';

export class EscrowConfigDto {
  @ApiProperty({
    description: 'Habilita a retenção dos recebíveis da subconta sob custódia (Escrow)',
    example: true,
  })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({
    description: 'Prazo em dias para expiração automática da garantia (default: indefinido até liberação manual)',
    example: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  daysToExpire?: number;
}

export class CreateSubaccountDto {
  @ApiProperty({
    description: 'ID único de referência externa do prestador/parceiro no backend consumidor',
    example: 'freelancer_usr_123',
  })
  @IsString()
  @IsNotEmpty()
  @IsSafeText()
  externalId: string;

  @ApiProperty({
    description: 'Nome completo ou Razão Social do titular da subconta',
    example: 'João da Silva Desenvolvedor ME',
  })
  @IsString()
  @MinLength(3)
  @SanitizeText()
  @IsSafeText()
  name: string;

  @ApiProperty({
    description: 'E-mail do titular da subconta',
    example: 'joao.silva@prestador.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'CPF ou CNPJ do titular (apenas dígitos)',
    example: '24971563792',
  })
  @IsString()
  @IsNotEmpty()
  cpfCnpj: string;

  @ApiPropertyOptional({
    description: 'Telefone comercial com DDD',
    example: '4738010919',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Celular com DDD',
    example: '47999887766',
  })
  @IsOptional()
  @IsString()
  mobilePhone?: string;

  @ApiPropertyOptional({
    description: 'Faturamento médio mensal em Reais (estimado)',
    example: 8000.0,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  incomeValue?: number;

  @ApiPropertyOptional({
    description: 'Logradouro / Endereço',
    example: 'Av. Paulista',
  })
  @IsOptional()
  @IsString()
  @SanitizeText()
  @IsSafeText()
  address?: string;

  @ApiPropertyOptional({
    description: 'Número do endereço',
    example: '1000',
  })
  @IsOptional()
  @IsString()
  addressNumber?: string;

  @ApiPropertyOptional({
    description: 'Bairro',
    example: 'Bela Vista',
  })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({
    description: 'CEP (apenas dígitos)',
    example: '01310100',
  })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional({
    description: 'Tipo societário do titular',
    enum: ['MEI', 'LIMITED', 'INDIVIDUAL', 'ASSOCIATION'],
    example: 'MEI',
  })
  @IsOptional()
  @IsEnum(['MEI', 'LIMITED', 'INDIVIDUAL', 'ASSOCIATION'])
  companyType?: string;

  @ApiPropertyOptional({
    description: 'Configuração de retenção de custódia (Conta Escrow) para a subconta',
    type: EscrowConfigDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => EscrowConfigDto)
  escrow?: EscrowConfigDto;
}
