import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { IsSafeText } from '../../../infra/security/validators/is-safe-text.decorator';

export class CreateOrGetCustomerDto {
  @ApiProperty({
    description: 'ID de referência externa no backend consumidor',
    example: 'user_uuid_123',
  })
  @IsString()
  @IsNotEmpty()
  @IsSafeText()
  externalId: string;

  @ApiProperty({
    description: 'Nome completo do cliente',
    example: 'John Doe',
  })
  @IsString()
  @MinLength(3)
  @IsSafeText()
  name: string;

  @ApiProperty({
    description: 'E-mail do cliente',
    example: 'john.doe@asaas.com.br',
  })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    description: 'CPF ou CNPJ (apenas dígitos)',
    example: '24971563792',
  })
  @IsOptional()
  @IsString()
  cpfCnpj?: string;

  @ApiPropertyOptional({
    description: 'Telefone com DDD',
    example: '4738010919',
  })
  @IsOptional()
  @IsString()
  phone?: string;
}
