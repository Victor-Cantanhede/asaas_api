import 'reflect-metadata';
import { validate, Environment } from '../env.validation';

describe('EnvironmentVariables Validation', () => {
  const baseValidConfig = {
    PORT: 5006,
    NODE_ENV: Environment.Development,
    API_KEY: 'local_api_key_secret_123',
    ASAAS_API_KEY: 'aact_test_key_123',
    ASAAS_ENVIRONMENT: 'sandbox',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5436/asaas_db',
    RABBITMQ_URL: 'amqp://user:pass@localhost:5672',
  };

  it('deve validar com sucesso a configuração padrão de desenvolvimento', () => {
    const validated = validate(baseValidConfig);
    expect(validated).toBeDefined();
    expect(validated.PORT).toBe(5006);
    expect(validated.NODE_ENV).toBe(Environment.Development);
    expect(validated.API_KEY).toBe('local_api_key_secret_123');
  });

  it('deve validar com sucesso em produção quando a API_KEY for forte (>= 32 caracteres)', () => {
    const prodConfig = {
      ...baseValidConfig,
      NODE_ENV: Environment.Production,
      API_KEY: 'prod_super_secure_secret_key_with_at_least_32_characters',
    };

    const validated = validate(prodConfig);
    expect(validated).toBeDefined();
    expect(validated.NODE_ENV).toBe(Environment.Production);
  });

  it('deve lançar erro em produção se a API_KEY for menor que 32 caracteres', () => {
    const prodConfig = {
      ...baseValidConfig,
      NODE_ENV: Environment.Production,
      API_KEY: 'short_key_under_32_chars',
    };

    expect(() => validate(prodConfig)).toThrow(
      /Segurança: Em ambiente de produção \(NODE_ENV=production\), a variável API_KEY deve conter um segredo forte com no mínimo 32 caracteres/,
    );
  });

  it('deve lançar erro em produção se a API_KEY for um valor padrão/exemplo conhecido', () => {
    const prodConfig = {
      ...baseValidConfig,
      NODE_ENV: Environment.Production,
      API_KEY: 'local_api_key_secret_123',
    };

    expect(() => validate(prodConfig)).toThrow(
      /Segurança: Em ambiente de produção \(NODE_ENV=production\), a variável API_KEY deve conter um segredo forte/,
    );
  });

  it('deve lançar erro se variáveis essenciais estiverem ausentes', () => {
    const incompleteConfig = {
      PORT: 5006,
    };

    expect(() => validate(incompleteConfig)).toThrow();
  });
});
