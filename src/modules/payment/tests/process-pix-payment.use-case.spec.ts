import { Test, TestingModule } from '@nestjs/testing';
import { ProcessPixPaymentUseCase } from '../use-cases/process-pix-payment.use-case';
import { PAYMENT_REPOSITORY_TOKEN } from '../repositories/payment.repository.interface';
import { CUSTOMER_REPOSITORY_TOKEN } from '../../customer/repositories/customer.repository.interface';
import { SyncCustomerUseCase } from '../../customer/use-cases/sync-customer.use-case';
import { AsaasClientProvider } from '../../../infra/asaas/asaas-client.provider';
import { EVENT_PUBLISHER_TOKEN } from '../../../infra/messaging/contracts/event-publisher.interface';
import { AsaasBadRequestException, AsaasGatewayException } from '../../../infra/asaas/errors';

describe('ProcessPixPaymentUseCase', () => {
  let useCase: ProcessPixPaymentUseCase;
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
      get: jest.fn(),
      post: jest.fn(),
    };

    eventPublisherMock = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessPixPaymentUseCase,
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

    useCase = module.get<ProcessPixPaymentUseCase>(ProcessPixPaymentUseCase);
  });

  it('should be defined', () => {
    expect(useCase).toBeDefined();
  });

  it('should create PIX charge in Asaas, fetch QR Code, persist and publish notification', async () => {
    const payment = {
      id: 'pay_1',
      customerId: 'cust_1',
      value: 150.0,
      dueDate: new Date('2026-09-15T00:00:00.000Z'),
      externalReference: 'order_1024',
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
      id: 'pay_asaas_999',
      status: 'PENDING',
      netValue: 148.01,
      invoiceUrl: 'https://sandbox.asaas.com/i/999',
    });

    asaasClientMock.get.mockResolvedValue({
      encodedImage: 'base64_qr_img',
      payload: 'pix_copia_e_cola',
      expirationDate: '2026-09-15 23:59:59',
    });

    await useCase.execute({ paymentId: 'pay_1' });

    expect(asaasClientMock.post).toHaveBeenCalledWith('/v3/payments', {
      customer: 'cus_asaas_123',
      billingType: 'PIX',
      value: 150.0,
      dueDate: '2026-09-15',
      externalReference: 'order_1024',
    });

    expect(asaasClientMock.get).toHaveBeenCalledWith('/v3/payments/pay_asaas_999/pixQrCode');

    expect(paymentRepositoryMock.update).toHaveBeenCalledWith('pay_1', {
      asaasPaymentId: 'pay_asaas_999',
      status: 'PENDING',
      netValue: 148.01,
      invoiceUrl: 'https://sandbox.asaas.com/i/999',
      pixQrCodeBase64: 'base64_qr_img',
      pixPayload: 'pix_copia_e_cola',
      pixExpirationDate: new Date('2026-09-15 23:59:59'),
      failureReason: null,
    });

    expect(eventPublisherMock.publish).toHaveBeenCalledWith(
      'webhook.forward_to_client',
      expect.objectContaining({
        event: 'PAYMENT_CREATED',
        payment: expect.objectContaining({
          id: 'pay_1',
          asaasPaymentId: 'pay_asaas_999',
        }),
      }),
    );
  });

  it('should parse split rules correctly in payload to Asaas', async () => {
    const splitConfig = JSON.stringify([
      { walletId: 'wallet_partner_1', fixedValue: 30.0 },
    ]);

    const payment = {
      id: 'pay_2',
      customerId: 'cust_2',
      value: 200.0,
      dueDate: null,
      externalReference: null,
      splitConfig,
    };

    const customer = {
      id: 'cust_2',
      externalId: 'ext_2',
      asaasCustomerId: 'cus_asaas_456',
    };

    paymentRepositoryMock.findById.mockResolvedValue(payment);
    customerRepositoryMock.findById.mockResolvedValue(customer);

    asaasClientMock.post.mockResolvedValue({ id: 'pay_asaas_888', status: 'PENDING' });
    asaasClientMock.get.mockResolvedValue({});

    await useCase.execute({ paymentId: 'pay_2' });

    expect(asaasClientMock.post).toHaveBeenCalledWith(
      '/v3/payments',
      expect.objectContaining({
        split: [{ walletId: 'wallet_partner_1', fixedValue: 30.0 }],
      }),
    );
  });

  it('should mark payment as FAILED without rethrowing when Asaas returns AsaasBadRequestException', async () => {
    const payment = {
      id: 'pay_3',
      customerId: 'cust_3',
      value: 10.0,
      dueDate: null,
      splitConfig: null,
    };

    const customer = {
      id: 'cust_3',
      externalId: 'ext_3',
      asaasCustomerId: 'cus_asaas_789',
    };

    paymentRepositoryMock.findById.mockResolvedValue(payment);
    customerRepositoryMock.findById.mockResolvedValue(customer);

    asaasClientMock.post.mockRejectedValue(
      new AsaasBadRequestException('Valor mínimo para PIX não atingido'),
    );

    await expect(useCase.execute({ paymentId: 'pay_3' })).resolves.not.toThrow();

    expect(paymentRepositoryMock.updateStatus).toHaveBeenCalledWith(
      'pay_3',
      'FAILED',
      'Valor mínimo para PIX não atingido',
    );
  });

  it('should mark payment as FAILED and rethrow on transient gateway exception', async () => {
    const payment = {
      id: 'pay_4',
      customerId: 'cust_4',
      value: 100.0,
      dueDate: null,
      splitConfig: null,
    };

    const customer = {
      id: 'cust_4',
      externalId: 'ext_4',
      asaasCustomerId: 'cus_asaas_000',
    };

    paymentRepositoryMock.findById.mockResolvedValue(payment);
    customerRepositoryMock.findById.mockResolvedValue(customer);

    asaasClientMock.post.mockRejectedValue(new AsaasGatewayException('Timeout', 504));

    await expect(useCase.execute({ paymentId: 'pay_4' })).rejects.toThrow(
      AsaasGatewayException,
    );

    expect(paymentRepositoryMock.updateStatus).toHaveBeenCalledWith(
      'pay_4',
      'FAILED',
      expect.stringContaining('Timeout'),
    );
  });
});
