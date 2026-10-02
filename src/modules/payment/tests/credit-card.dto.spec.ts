import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreditCardDto } from '../dto/credit-card.dto';
import { CreateCreditCardPaymentDto } from '../dto/create-credit-card-payment.dto';

describe('CreditCardDto & CreateCreditCardPaymentDto Validation', () => {
  const originalAsaasEnv = process.env.ASAAS_ENVIRONMENT;

  beforeEach(() => {
    process.env.ASAAS_ENVIRONMENT = 'sandbox';
  });

  afterEach(() => {
    process.env.ASAAS_ENVIRONMENT = originalAsaasEnv;
  });

  it('deve transformar e validar com sucesso os dados do cartão de teste do Asaas Sandbox (4444 4444 4444 4444)', async () => {
    const rawData = {
      holderName: 'TEST USER',
      number: '4444 4444 4444 4444',
      expiryMonth: ' 12 ',
      expiryYear: ' 2028 ',
      ccv: ' 123 ',
    };

    const instance = plainToInstance(CreditCardDto, rawData);

    // Verifica se @Transform removeu espaços e traços
    expect(instance.number).toBe('4444444444444444');
    expect(instance.expiryMonth).toBe('12');
    expect(instance.expiryYear).toBe('2028');
    expect(instance.ccv).toBe('123');

    const errors = await validate(instance);
    expect(errors.length).toBe(0);
  });

  it('deve validar com sucesso CreateCreditCardPaymentDto contendo o cartão de teste do Asaas Sandbox', async () => {
    const rawPayload = {
      customerId: 'cust_123',
      value: 150.5,
      remoteIp: '187.12.34.56',
      creditCard: {
        holderName: 'JOHN DOE',
        number: '4444 4444 4444 4444',
        expiryMonth: '12',
        expiryYear: '2028',
        ccv: '123',
      },
    };

    const dtoInstance = plainToInstance(CreateCreditCardPaymentDto, rawPayload);

    expect(dtoInstance.creditCard?.number).toBe('4444444444444444');

    const errors = await validate(dtoInstance);
    expect(errors.length).toBe(0);
  });

  it('deve rejeitar cartão com número inválido que não pertença ao sandbox nem seja cartão real', async () => {
    const rawPayload = {
      customerId: 'cust_123',
      value: 150.5,
      remoteIp: '187.12.34.56',
      creditCard: {
        holderName: 'JOHN DOE',
        number: '1234 5678',
        expiryMonth: '12',
        expiryYear: '2028',
        ccv: '123',
      },
    };

    const dtoInstance = plainToInstance(CreateCreditCardPaymentDto, rawPayload);
    const errors = await validate(dtoInstance);

    expect(errors.length).toBeGreaterThan(0);
    const creditCardError = errors.find((e) => e.property === 'creditCard');
    expect(creditCardError).toBeDefined();

    const nestedErrors = creditCardError?.children || [];
    const numberError = nestedErrors.find((e) => e.property === 'number');
    expect(numberError).toBeDefined();
    expect(numberError?.constraints?.isCreditCardOrSandbox).toBe(
      'number must be a credit card',
    );
  });
});
