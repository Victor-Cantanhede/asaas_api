import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, validateSync } from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsNumber()
  @IsOptional()
  PORT: number = 5006;

  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsString()
  API_KEY: string;

  @IsString()
  @IsOptional()
  API_KEY_READ?: string;

  @IsString()
  @IsOptional()
  API_KEY_PAYMENTS?: string;

  @IsString()
  @IsOptional()
  CARD_ENCRYPTION_KEY?: string;

  @IsString()
  @IsOptional()
  SWAGGER_USER?: string;

  @IsString()
  @IsOptional()
  SWAGGER_PASSWORD?: string;

  @IsString()
  @IsOptional()
  SWAGGER_ENABLED?: string;

  @IsString()
  ASAAS_API_KEY: string;

  @IsString()
  @IsOptional()
  ASAAS_ENVIRONMENT: string = 'sandbox';

  @IsString()
  @IsOptional()
  ASAAS_WEBHOOK_SECRET: string;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  RABBITMQ_URL: string;

  @IsString()
  @IsOptional()
  RABBITMQ_MAIN_QUEUE: string = 'asaas_main_queue';

  @IsString()
  @IsOptional()
  RABBITMQ_DLQ_QUEUE: string = 'asaas_dlq_queue';

  @IsString()
  @IsOptional()
  CLIENT_WEBHOOK_URL: string;

  @IsString()
  @IsOptional()
  CLIENT_WEBHOOK_SECRET: string;
}

export const KNOWN_INSECURE_API_KEYS = [
  'local_api_key_secret_123',
  'secret_api_key_123',
  'changeme',
  'admin',
  'password',
  '123456',
  'test_key',
];

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  // Validação estrita de segurança para ambiente de produção
  if (validatedConfig.NODE_ENV === Environment.Production) {
    const apiKey = validatedConfig.API_KEY ? validatedConfig.API_KEY.trim() : '';

    if (
      !apiKey ||
      KNOWN_INSECURE_API_KEYS.includes(apiKey.toLowerCase()) ||
      apiKey.length < 32
    ) {
      throw new Error(
        'Segurança: Em ambiente de produção (NODE_ENV=production), a variável API_KEY deve conter um segredo forte com no mínimo 32 caracteres e não pode utilizar valores padrão/exemplo conhecidos.',
      );
    }
  }

  return validatedConfig;
}
