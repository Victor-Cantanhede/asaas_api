import { Test, TestingModule } from '@nestjs/testing';
import { ProcessCreditCardPaymentUseCase } from '../use-cases/process-credit-card-payment.use-case';
import { PAYMENT_REPOSITORY_TOKEN } from '../repositories/payment.repository.interface';
import { CUSTOMER_REPOSITORY_TOKEN } from '../../customer/repositories/customer.repository.interface';
import { SyncCustomerUseCase } from '../../customer/use-cases/sync-customer.use-case';
import { AsaasClientProvider } from '../../../infra/asaas/asaas-client.provider';
import { EVENT_PUBLISHER_TOKEN } from '../../../infra/messaging/contracts/event-publisher.interface';
import { AsaasBadRequestException, AsaasGatewayException } from '../../../infra/asaas/errors';

describe('ProcessCreditCardPaymentUseCase', () => {
  let useCase: ProcessCreditCardPaymentUseCase;
  let paymentRepositoryMock: any;
  let customerRepositoryMock: any;
  let syncCustomerUseCaseMock: any;
  let asaasClientMock: any;
  let eventPublisherMock: any;

  beforeEach(async () => {
    paymentRepositoryMock = {
      findById: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateStatus: jest.fn().mockResolvedValue({}),
    };

    customerRepositoryMock = {
      findById: jest.fn(),
    };

    syncCustomerUseCaseMock = {
      execute: jest.fn().mockResolvedValue(undefined),
    };

    asaasClientMock = {
      post: jest.fn(),
    };

    eventPublisherMock = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessCreditCardPaymentUseCase,
        {
          provide: PAYMENT_REPOSITORY_TOKEN,
          useValue: paymentRepositoryMock,
        },
        {
          provide: CUSTOMER_REPOSITORY_TOKEN,
          useValue: customerRepositoryMock,
        },
        {
          provide: SyncCustomerUseCase,
          useValue: syncCustomerUseCaseMock,
        },
        {
          provide: AsaasClientProvider,
          useValue: asaasClientMock,
        },
        {
          provide: EVENT_PUBLISHER_TOKEN,
          useValue: eventPublisherMock,
        },
      ],
    }).compile();

    useCase = module.get<ProcessCreditCardPaymentUseCase>(
      ProcessCreditCardPaymentUseCase,
    );
  });

  it('should be defined', () => {
    expect(useCase).toBeDefined();
  });

  it('should charge raw credit card, update to CONFIRMED and publish webhook notification', async () => {
    const payment = {
      id: 'pay_cc_1',
      customerId: 'cust_1',
      value: 300.0,
      dueDate: new Date('2026-09-10T00:00:00.000Z'),
      externalReference: 'order_2048',
      splitConfig: null,
    };

    const customer = {
      id: 'cust_1',
      externalId: 'ext_1',
      asaasCustomerId: 'cus_asaas_123',
    };

    paymentRepositoryMock.findById.mockResolvedValue(payment);
    customerRepositoryMock.findById.mockResolvedValue(customer);

    asaasClientMock.post.mockResolvedValue({
      id: 'pay_asaas_cc_999',
      status: 'CONFIRMED',
      netValue: 288.5,
      invoiceUrl: 'https://sandbox.asaas.com/i/cc999',
      creditCard: {
        creditCardNumber: '1111',
        creditCardBrand: 'VISA',
        creditCardToken: 'token_generated_uuid',
      },
    });

    const input = {
      paymentId: 'pay_cc_1',
      remoteIp: '187.12.34.56',
      creditCard: {
        holderName: 'JOHN DOE',
        number: '4111111111111111',
        expiryMonth: '12',
        expiryYear: '2028',
        ccv: '123',
      },
      creditCardHolderInfo: {
        name: 'John Doe',
        email: 'john@example.com',
        cpfCnpj: '24971563792',
        postalCode: '01310-000',
        addressNumber: '150',
      },
    };

    await useCase.execute(input);

    expect(asaasClientMock.post).toHaveBeenCalledWith('/v3/payments', {
      customer: 'cus_asaas_123',
      billingType: 'CREDIT_CARD',
      value: 300.0,
      dueDate: '2026-09-10',
      remoteIp: '187.12.34.56',
      externalReference: 'order_2048',
      creditCard: input.creditCard,
      creditCardHolderInfo: input.creditCardHolderInfo,
    });

    expect(paymentRepositoryMock.update).toHaveBeenCalledWith('pay_cc_1', {
      asaasPaymentId: 'pay_asaas_cc_999',
      status: 'CONFIRMED',
      netValue: 288.5,
      invoiceUrl: 'https://sandbox.asaas.com/i/cc999',
      failureReason: null,
    });

    expect(eventPublisherMock.publish).toHaveBeenCalledWith(
      'webhook.forward_to_client',
      expect.objectContaining({
        event: 'PAYMENT_CONFIRMED',
        payment: expect.objectContaining({
          id: 'pay_cc_1',
          asaasPaymentId: 'pay_asaas_cc_999',
          status: 'CONFIRMED',
        }),
      }),
    );
  });

  it('should charge using saved creditCardToken without raw card data', async () => {
    const payment = {
      id: 'pay_cc_2',
      customerId: 'cust_2',
      value: 120.0,
      dueDate: null,
      externalReference: null,
      splitConfig: null,
    };

    const customer = {
      id: 'cust_2',
      externalId: 'ext_2',
      asaasCustomerId: 'cus_asaas_456',
    };

    paymentRepositoryMock.findById.mockResolvedValue(payment);
    customerRepositoryMock.findById.mockResolvedValue(customer);

    asaasClientMock.post.mockResolvedValue({
      id: 'pay_asaas_token_888',
      status: 'CONFIRMED',
      netValue: 115.0,
    });

    const input = {
      paymentId: 'pay_cc_2',
      remoteIp: '187.12.34.56',
      creditCardToken: 'token_saved_999',
    };

    await useCase.execute(input);

    expect(asaasClientMock.post).toHaveBeenCalledWith(
      '/v3/payments',
      expect.objectContaining({
        creditCardToken: 'token_saved_999',
      }),
    );
    expect(paymentRepositoryMock.update).toHaveBeenCalledWith(
      'pay_cc_2',
      expect.objectContaining({
        status: 'CONFIRMED',
      }),
    );
  });

  it('should calculate installments when installmentCount > 1', async () => {
    const payment = {
      id: 'pay_cc_3',
      customerId: 'cust_3',
      value: 600.0,
      dueDate: null,
      externalReference: null,
      splitConfig: null,
    };

    const customer = {
      id: 'cust_3',
      externalId: 'ext_3',
      asaasCustomerId: 'cus_asaas_789',
    };

    paymentRepositoryMock.findById.mockResolvedValue(payment);
    customerRepositoryMock.findById.mockResolvedValue(customer);

    asaasClientMock.post.mockResolvedValue({
      id: 'pay_asaas_inst_777',
      status: 'CONFIRMED',
    });

    const input = {
      paymentId: 'pay_cc_3',
      remoteIp: '187.12.34.56',
      creditCardToken: 'token_123',
      installmentCount: 3,
    };

    await useCase.execute(input);

    expect(asaasClientMock.post).toHaveBeenCalledWith(
      '/v3/payments',
      expect.objectContaining({
        installmentCount: 3,
        installmentValue: 200.0,
      }),
    );
  });

  it('should handle card decline (400 Asaas) by marking as FAILED and publishing PAYMENT_FAILED without rethrowing', async () => {
    const payment = {
      id: 'pay_cc_4',
      customerId: 'cust_4',
      value: 50.0,
      dueDate: null,
      externalReference: null,
      splitConfig: null,
    };

    const customer = {
      id: 'cust_4',
      externalId: 'ext_4',
      asaasCustomerId: 'cus_asaas_000',
    };

    paymentRepositoryMock.findById.mockResolvedValue(payment);
    customerRepositoryMock.findById.mockResolvedValue(customer);

    asaasClientMock.post.mockRejectedValue(
      new AsaasBadRequestException('Transação não autorizada pela emissora do cartão'),
    );

    await expect(
      useCase.execute({
        paymentId: 'pay_cc_4',
        remoteIp: '187.12.34.56',
        creditCardToken: 'invalid_token',
      }),
    ).resolves.not.toThrow();

    expect(paymentRepositoryMock.updateStatus).toHaveBeenCalledWith(
      'pay_cc_4',
      'FAILED',
      'Transação não autorizada pela emissora do cartão',
    );

    expect(eventPublisherMock.publish).toHaveBeenCalledWith(
      'webhook.forward_to_client',
      expect.objectContaining({
        event: 'PAYMENT_FAILED',
        payment: expect.objectContaining({
          id: 'pay_cc_4',
          status: 'FAILED',
        }),
      }),
    );
  });

  it('should mark as FAILED and rethrow when transient AsaasGatewayException occurs', async () => {
    const payment = {
      id: 'pay_cc_5',
      customerId: 'cust_5',
      value: 50.0,
      dueDate: null,
      externalReference: null,
      splitConfig: null,
    };

    const customer = {
      id: 'cust_5',
      externalId: 'ext_5',
      asaasCustomerId: 'cus_asaas_111',
    };

    paymentRepositoryMock.findById.mockResolvedValue(payment);
    customerRepositoryMock.findById.mockResolvedValue(customer);

    asaasClientMock.post.mockRejectedValue(
      new AsaasGatewayException('Connection timed out', 504),
    );

    await expect(
      useCase.execute({
        paymentId: 'pay_cc_5',
        remoteIp: '187.12.34.56',
        creditCardToken: 'token_abc',
      }),
    ).rejects.toThrow(AsaasGatewayException);

    expect(paymentRepositoryMock.updateStatus).toHaveBeenCalledWith(
      'pay_cc_5',
      'FAILED',
      expect.stringContaining('Connection timed out'),
    );
  });
});
