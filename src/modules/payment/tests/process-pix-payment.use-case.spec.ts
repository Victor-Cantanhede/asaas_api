import { Test, TestingModule } from '@nestjs/testing';
import { ProcessPixPaymentUseCase } from '../use-cases/process-pix-payment.use-case';
import { PAYMENT_REPOSITORY_TOKEN } from '../repositories/payment.repository.interface';
import { CUSTOMER_REPOSITORY_TOKEN } from '../../customer/repositories/customer.repository.interface';
import { SyncCustomerUseCase } from '../../customer/use-cases/sync-customer.use-case';
import { AsaasClientProvider } from '../../../infra/asaas/asaas-client.provider';
import { EVENT_PUBLISHER_TOKEN } from '../../../infra/messaging/contracts/event-publisher.interface';
import { SUBACCOUNT_REPOSITORY_TOKEN } from '../../subaccount/repositories/subaccount.repository.interface';
import { AsaasBadRequestException, AsaasGatewayException } from '../../../infra/asaas/errors';

describe('ProcessPixPaymentUseCase', () => {
  let useCase: ProcessPixPaymentUseCase;
  let paymentRepositoryMock: any;
  let customerRepositoryMock: any;
  let subaccountRepositoryMock: any;
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

    subaccountRepositoryMock = {
      findByExternalId: jest.fn(),
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
          provide: SUBACCOUNT_REPOSITORY_TOKEN,
          useValue: subaccountRepositoryMock,
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
      escrowStatus: 'NONE',
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

  it('should resolve subaccountExternalId to walletId automatically using SubaccountRepository and set escrowStatus ACTIVE', async () => {
    const splitConfig = JSON.stringify([
      { subaccountExternalId: 'freelancer_ext_1', fixedValue: 120.0 },
    ]);

    const payment = {
      id: 'pay_split_dx',
      customerId: 'cust_split',
      value: 150.0,
      dueDate: null,
      externalReference: 'order_split_1',
      splitConfig,
    };

    const customer = {
      id: 'cust_split',
      externalId: 'ext_cust_split',
      asaasCustomerId: 'cus_asaas_split',
    };

    paymentRepositoryMock.findById.mockResolvedValue(payment);
    customerRepositoryMock.findById.mockResolvedValue(customer);
    subaccountRepositoryMock.findByExternalId.mockResolvedValue({
      id: 'subacc_uuid_1',
      externalId: 'freelancer_ext_1',
      walletId: 'wallet_resolved_999',
    });

    asaasClientMock.post.mockResolvedValue({
      id: 'pay_asaas_split_1',
      status: 'PENDING',
      escrow: { status: 'ACTIVE' },
    });
    asaasClientMock.get.mockResolvedValue({});

    await useCase.execute({ paymentId: 'pay_split_dx' });

    expect(subaccountRepositoryMock.findByExternalId).toHaveBeenCalledWith('freelancer_ext_1');
    expect(asaasClientMock.post).toHaveBeenCalledWith(
      '/v3/payments',
      expect.objectContaining({
        split: [{ walletId: 'wallet_resolved_999', fixedValue: 120.0 }],
      }),
    );
    expect(paymentRepositoryMock.update).toHaveBeenCalledWith(
      'pay_split_dx',
      expect.objectContaining({
        escrowStatus: 'ACTIVE',
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

  describe('Edge Cases & Reliability Hardening', () => {
    it('should return early without calling Asaas if payment is not found', async () => {
      paymentRepositoryMock.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({ paymentId: 'pay_missing_pix' }),
      ).resolves.not.toThrow();

      expect(customerRepositoryMock.findById).not.toHaveBeenCalled();
      expect(asaasClientMock.post).not.toHaveBeenCalled();
      expect(paymentRepositoryMock.updateStatus).not.toHaveBeenCalled();
    });

    it('should mark payment as FAILED if customer is not found in repository', async () => {
      const payment = {
        id: 'pay_pix_no_cust',
        customerId: 'cust_missing',
      };
      paymentRepositoryMock.findById.mockResolvedValue(payment);
      customerRepositoryMock.findById.mockResolvedValue(null);

      await useCase.execute({ paymentId: 'pay_pix_no_cust' });

      expect(paymentRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'pay_pix_no_cust',
        'FAILED',
        'Cliente associado ao pagamento não localizado',
      );
      expect(asaasClientMock.post).not.toHaveBeenCalled();
    });

    it('should sync customer when asaasCustomerId is missing and proceed with PIX creation', async () => {
      const payment = {
        id: 'pay_pix_sync',
        customerId: 'cust_unsynced',
        value: 50.0,
        dueDate: null,
      };

      const custBeforeSync = {
        id: 'cust_unsynced',
        externalId: 'ext_unsynced_pix',
        asaasCustomerId: null,
      };

      const custAfterSync = {
        id: 'cust_unsynced',
        externalId: 'ext_unsynced_pix',
        asaasCustomerId: 'cus_synced_pix_123',
      };

      paymentRepositoryMock.findById.mockResolvedValue(payment);
      customerRepositoryMock.findById
        .mockResolvedValueOnce(custBeforeSync)
        .mockResolvedValueOnce(custAfterSync);

      asaasClientMock.post.mockResolvedValue({
        id: 'pay_asaas_pix_synced',
        status: 'PENDING',
      });
      asaasClientMock.get.mockResolvedValue({
        encodedImage: 'base64_qr',
        payload: 'copia-e-cola',
        expirationDate: '2026-09-20',
      });

      await useCase.execute({ paymentId: 'pay_pix_sync' });

      expect(syncCustomerUseCaseMock.execute).toHaveBeenCalledWith({
        customerId: 'cust_unsynced',
        externalId: 'ext_unsynced_pix',
      });
      expect(asaasClientMock.post).toHaveBeenCalledWith(
        '/v3/payments',
        expect.objectContaining({
          customer: 'cus_synced_pix_123',
        }),
      );
    });

    it('should mark payment as FAILED if customer sync does not yield asaasCustomerId', async () => {
      const payment = {
        id: 'pay_pix_sync_fail',
        customerId: 'cust_pix_fail',
      };

      const custWithoutAsaas = {
        id: 'cust_pix_fail',
        externalId: 'ext_pix_fail',
        asaasCustomerId: null,
      };

      paymentRepositoryMock.findById.mockResolvedValue(payment);
      customerRepositoryMock.findById.mockResolvedValue(custWithoutAsaas);

      await useCase.execute({ paymentId: 'pay_pix_sync_fail' });

      expect(paymentRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'pay_pix_sync_fail',
        'FAILED',
        'Não foi possível obter o identificador Asaas do cliente',
      );
      expect(asaasClientMock.post).not.toHaveBeenCalled();
    });

    it('should gracefully handle transient QR Code fetch failure without aborting payment creation', async () => {
      const payment = {
        id: 'pay_pix_qr_fail',
        customerId: 'cust_qr_fail',
        value: 120.0,
        dueDate: null,
      };

      const customer = {
        id: 'cust_qr_fail',
        asaasCustomerId: 'cus_qr_fail_123',
      };

      paymentRepositoryMock.findById.mockResolvedValue(payment);
      customerRepositoryMock.findById.mockResolvedValue(customer);

      asaasClientMock.post.mockResolvedValue({
        id: 'pay_asaas_qr_fail',
        status: 'PENDING',
      });

      // Simula falha transitória na rota de QR code do Asaas
      asaasClientMock.get.mockRejectedValue(new Error('500 Internal Server Error on QR Code fetch'));

      await expect(
        useCase.execute({ paymentId: 'pay_pix_qr_fail' }),
      ).resolves.not.toThrow();

      expect(paymentRepositoryMock.update).toHaveBeenCalledWith(
        'pay_pix_qr_fail',
        expect.objectContaining({
          asaasPaymentId: 'pay_asaas_qr_fail',
          pixQrCodeBase64: null,
          pixPayload: null,
          pixExpirationDate: null,
        }),
      );

      expect(eventPublisherMock.publish).toHaveBeenCalledWith(
        'webhook.forward_to_client',
        expect.objectContaining({
          event: 'PAYMENT_CREATED',
        }),
      );
    });

    it('should resolve splitConfig with walletId and subaccountExternalId', async () => {
      const splitConfig = JSON.stringify([
        { walletId: 'wallet_direct_1', fixedValue: 20.0 },
        { subaccountExternalId: 'ext_subacc_target', percentualValue: 10.0, description: 'Comissão' },
      ]);

      const payment = {
        id: 'pay_pix_split_ok',
        customerId: 'cust_pix_split',
        value: 200.0,
        dueDate: null,
        splitConfig,
      };

      const customer = {
        id: 'cust_pix_split',
        asaasCustomerId: 'cus_split_123',
      };

      paymentRepositoryMock.findById.mockResolvedValue(payment);
      customerRepositoryMock.findById.mockResolvedValue(customer);
      subaccountRepositoryMock.findByExternalId.mockResolvedValue({
        id: 'subacc_local_id',
        externalId: 'ext_subacc_target',
        walletId: 'wallet_resolved_subacc',
      });

      asaasClientMock.post.mockResolvedValue({
        id: 'pay_asaas_split_ok',
        status: 'PENDING',
      });
      asaasClientMock.get.mockResolvedValue({});

      await useCase.execute({ paymentId: 'pay_pix_split_ok' });

      expect(subaccountRepositoryMock.findByExternalId).toHaveBeenCalledWith('ext_subacc_target');
      expect(asaasClientMock.post).toHaveBeenCalledWith(
        '/v3/payments',
        expect.objectContaining({
          split: [
            { walletId: 'wallet_direct_1', fixedValue: 20.0 },
            { walletId: 'wallet_resolved_subacc', percentualValue: 10.0, description: 'Comissão' },
          ],
        }),
      );
    });

    it('should gracefully handle malformed splitConfig JSON without throwing and proceed with payment', async () => {
      const payment = {
        id: 'pay_pix_invalid_split',
        customerId: 'cust_pix_valid',
        value: 150.0,
        dueDate: null,
        splitConfig: '{ invalid: malformed: json',
      };

      const customer = {
        id: 'cust_pix_valid',
        asaasCustomerId: 'cus_pix_valid_123',
      };

      paymentRepositoryMock.findById.mockResolvedValue(payment);
      customerRepositoryMock.findById.mockResolvedValue(customer);
      asaasClientMock.post.mockResolvedValue({
        id: 'pay_asaas_no_split',
        status: 'PENDING',
      });
      asaasClientMock.get.mockResolvedValue({});

      await useCase.execute({ paymentId: 'pay_pix_invalid_split' });

      expect(asaasClientMock.post).toHaveBeenCalledWith(
        '/v3/payments',
        expect.not.objectContaining({
          split: expect.anything(),
        }),
      );
    });
  });
});

