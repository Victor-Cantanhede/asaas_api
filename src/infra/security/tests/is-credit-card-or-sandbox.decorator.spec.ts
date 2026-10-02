import 'reflect-metadata';
import { validate } from 'class-validator';
import {
  IsCreditCardOrSandbox,
  isAsaasCreditCardValid,
  isSandboxEnvironment,
} from '../validators/is-credit-card-or-sandbox.decorator';

class TestCardDto {
  @IsCreditCardOrSandbox()
  cardNumber!: string;
}

describe('IsCreditCardOrSandbox Decorator & Validation', () => {
  const originalAsaasEnv = process.env.ASAAS_ENVIRONMENT;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.ASAAS_ENVIRONMENT = originalAsaasEnv;
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('isSandboxEnvironment', () => {
    it('deve identificar ambiente sandbox quando ASAAS_ENVIRONMENT=sandbox', () => {
      process.env.ASAAS_ENVIRONMENT = 'sandbox';
      process.env.NODE_ENV = 'production';
      expect(isSandboxEnvironment()).toBe(true);
    });

    it('deve identificar ambiente sandbox quando ASAAS_ENVIRONMENT não for production e NODE_ENV for test/development', () => {
      delete process.env.ASAAS_ENVIRONMENT;
      process.env.NODE_ENV = 'test';
      expect(isSandboxEnvironment()).toBe(true);

      process.env.NODE_ENV = 'development';
      expect(isSandboxEnvironment()).toBe(true);
    });

    it('deve identificar como produção quando ASAAS_ENVIRONMENT=production', () => {
      process.env.ASAAS_ENVIRONMENT = 'production';
      expect(isSandboxEnvironment()).toBe(false);
    });

    it('deve identificar como produção quando ASAAS_ENVIRONMENT não for definido e NODE_ENV=production', () => {
      delete process.env.ASAAS_ENVIRONMENT;
      process.env.NODE_ENV = 'production';
      expect(isSandboxEnvironment()).toBe(false);
    });
  });

  describe('isAsaasCreditCardValid', () => {
    it('deve aprovar o cartão oficial de homologação do Asaas (4444 4444 4444 4444) em sandbox', () => {
      expect(isAsaasCreditCardValid('4444 4444 4444 4444', true)).toBe(true);
      expect(isAsaasCreditCardValid('4444444444444444', true)).toBe(true);
      expect(isAsaasCreditCardValid('4444-4444-4444-4444', true)).toBe(true);
    });

    it('deve rejeitar o cartão 4444 4444 4444 4444 quando em produção (isSandbox = false)', () => {
      expect(isAsaasCreditCardValid('4444 4444 4444 4444', false)).toBe(false);
      expect(isAsaasCreditCardValid('4444444444444444', false)).toBe(false);
    });

    it('deve aprovar os cartões de recusa oficiais do Asaas (Mastercard e Visa) em qualquer ambiente', () => {
      // Mastercard de recusa Asaas
      expect(isAsaasCreditCardValid('5184 0197 4037 3151', true)).toBe(true);
      expect(isAsaasCreditCardValid('5184019740373151', false)).toBe(true);

      // Visa de recusa Asaas
      expect(isAsaasCreditCardValid('4916 5613 5824 0741', true)).toBe(true);
      expect(isAsaasCreditCardValid('4916561358240741', false)).toBe(true);
    });

    it('deve aprovar cartões de crédito reais e válidos (Luhn algorithm)', () => {
      expect(isAsaasCreditCardValid('4111 1111 1111 1111', false)).toBe(true);
      expect(isAsaasCreditCardValid('4111111111111111', true)).toBe(true);
    });

    it('deve rejeitar entradas não-string, vazias ou formatos inválidos', () => {
      expect(isAsaasCreditCardValid(null as any)).toBe(false);
      expect(isAsaasCreditCardValid(undefined as any)).toBe(false);
      expect(isAsaasCreditCardValid(1234567812345678 as any)).toBe(false);
      expect(isAsaasCreditCardValid('')).toBe(false);
      expect(isAsaasCreditCardValid('123')).toBe(false);
      expect(isAsaasCreditCardValid('cartao_invalido')).toBe(false);
      expect(isAsaasCreditCardValid('0000 0000 0000 0000')).toBe(false);
    });
  });

  describe('@IsCreditCardOrSandbox (class-validator)', () => {
    it('deve passar na validação de DTO com o cartão oficial do Asaas Sandbox (com e sem espaços)', async () => {
      process.env.ASAAS_ENVIRONMENT = 'sandbox';

      const dtoWithSpaces = new TestCardDto();
      dtoWithSpaces.cardNumber = '4444 4444 4444 4444';
      const errors1 = await validate(dtoWithSpaces);
      expect(errors1.length).toBe(0);

      const dtoWithoutSpaces = new TestCardDto();
      dtoWithoutSpaces.cardNumber = '4444444444444444';
      const errors2 = await validate(dtoWithoutSpaces);
      expect(errors2.length).toBe(0);
    });

    it('deve falhar com mensagem padronizada quando o número for inválido', async () => {
      const dto = new TestCardDto();
      dto.cardNumber = '12345';
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.isCreditCardOrSandbox).toBe(
        'cardNumber must be a credit card',
      );
    });
  });
});
