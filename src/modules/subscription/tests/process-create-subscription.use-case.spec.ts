import { Test, TestingModule } from '@nestjs/testing';
import { ProcessCreateSubscriptionUseCase } from '../use-cases/process-create-subscription.use-case';
import { SUBSCRIPTION_REPOSITORY_TOKEN } from '../repositories/subscription.repository.interface';
import { CUSTOMER_REPOSITORY_TOKEN } from '../../customer/repositories/customer.repository.interface';
import { SyncCustomerUseCase } from '../../customer/use-cases/sync-customer.use-case';
import { AsaasClientProvider } from '../../../infra/asaas/asaas-client.provider';
import { EVENT_PUBLISHER_TOKEN } from '../../../infra/messaging/contracts/event-publisher.interface';
import { AsaasBadRequestException, AsaasGatewayException } from '../../../infra/asaas/errors';

describe('ProcessCreateSubscriptionUseCase (Unit & Reliability Specialist)', () => {
  let useCase: ProcessCreateSubscriptionUseCase;
  let subscriptionRepositoryMock: any;
  let customerRepositoryMock: any;
  let syncCustomerUseCaseMock: any;
  let asaasClientMock: any;
  let eventPublisherMock: any;

  beforeEach(async () => {
    subscriptionRepositoryMock = {
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
        ProcessCreateSubscriptionUseCase,
        {
          provide: SUBSCRIPTION_REPOSITORY_TOKEN,
          useValue: subscriptionRepositoryMock,
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

    useCase = module.get<ProcessCreateSubscriptionUseCase>(
      ProcessCreateSubscriptionUseCase,
    );
  });

  describe('1. Caminho Feliz (Nominal)', () => {
    it('deve criar assinatura com token, persistir e publicar SUBSCRIPTION_CREATED', async () => {
      const subscription = {
        id: 'sub_nom_1',
        customerId: 'cust_nom_1',
        value: 120.5,
        cycle: 'MONTHLY',
        nextDueDate: new Date('2026-12-01T00:00:00.000Z'),
        externalReference: 'ext_ref_100',
      };

      const customer = {
        id: 'cust_nom_1',
        externalId: 'ext_client_1',
        asaasCustomerId: 'cus_asaas_ready_1',
      };

      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
      customerRepositoryMock.findById.mockResolvedValue(customer);

      asaasClientMock.post.mockResolvedValue({
        id: 'sub_asaas_888',
        status: 'ACTIVE',
        creditCard: {
          creditCardToken: 'tok_active_888',
          creditCardBrand: 'MASTERCARD',
          creditCardNumber: '5555',
        },
      });

      const input = {
        subscriptionId: 'sub_nom_1',
        remoteIp: '187.12.34.56',
        creditCardToken: 'tok_active_888',
      };

      await useCase.execute(input);

      expect(asaasClientMock.post).toHaveBeenCalledWith('/v3/subscriptions', {
        customer: 'cus_asaas_ready_1',
        billingType: 'CREDIT_CARD',
        value: 120.5,
        cycle: 'MONTHLY',
        remoteIp: '187.12.34.56',
        nextDueDate: '2026-12-01',
        externalReference: 'ext_ref_100',
        creditCardToken: 'tok_active_888',
      });

      expect(subscriptionRepositoryMock.update).toHaveBeenCalledWith('sub_nom_1', {
        asaasSubscriptionId: 'sub_asaas_888',
        status: 'ACTIVE',
        creditCardToken: 'tok_active_888',
        creditCardBrand: 'MASTERCARD',
        creditCardLast4: '5555',
        failureReason: null,
      });

      expect(eventPublisherMock.publish).toHaveBeenCalledWith(
        'webhook.forward_to_client',
        {
          event: 'SUBSCRIPTION_CREATED',
          subscription: {
            id: 'sub_nom_1',
            asaasSubscriptionId: 'sub_asaas_888',
            status: 'ACTIVE',
            value: 120.5,
            cycle: 'MONTHLY',
          },
        },
      );
    });

    it('deve criar assinatura com dados brutos de cartão e creditCardHolderInfo', async () => {
      const subscription = {
        id: 'sub_raw_card',
        customerId: 'cust_2',
        value: 89.9,
        cycle: 'QUARTERLY',
      };

      const customer = {
        id: 'cust_2',
        asaasCustomerId: 'cus_asaas_2',
      };

      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
      customerRepositoryMock.findById.mockResolvedValue(customer);

      asaasClientMock.post.mockResolvedValue({
        id: 'sub_asaas_999',
        status: 'ACTIVE',
      });

      const rawCard = {
        holderName: 'CARLOS SILVA',
        number: '4000000000001234',
        expiryMonth: '11',
        expiryYear: '2028',
        ccv: '999',
      };

      const holderInfo = {
        name: 'CARLOS SILVA',
        email: 'carlos@example.com',
        cpfCnpj: '11122233344',
        postalCode: '20000000',
        addressNumber: '50',
      };

      await useCase.execute({
        subscriptionId: 'sub_raw_card',
        remoteIp: '189.20.30.40',
        creditCard: rawCard,
        creditCardHolderInfo: holderInfo,
      });

      expect(asaasClientMock.post).toHaveBeenCalledWith('/v3/subscriptions', {
        customer: 'cus_asaas_2',
        billingType: 'CREDIT_CARD',
        value: 89.9,
        cycle: 'QUARTERLY',
        remoteIp: '189.20.30.40',
        creditCard: rawCard,
        creditCardHolderInfo: holderInfo,
      });
    });
  });

  describe('2. Valores Limítrofes e Edge Cases', () => {
    it('deve sincronizar automaticamente o cliente caso ele não possua asaasCustomerId e prosseguir', async () => {
      const subscription = {
        id: 'sub_sync_ok',
        customerId: 'cust_unsynced',
        value: 50.0,
        cycle: 'MONTHLY',
      };

      const customerWithoutAsaas = {
        id: 'cust_unsynced',
        externalId: 'ext_unsynced_1',
        asaasCustomerId: null,
      };

      const customerAfterSync = {
        id: 'cust_unsynced',
        externalId: 'ext_unsynced_1',
        asaasCustomerId: 'cus_synced_auto_999',
      };

      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
      customerRepositoryMock.findById
        .mockResolvedValueOnce(customerWithoutAsaas)
        .mockResolvedValueOnce(customerAfterSync);

      asaasClientMock.post.mockResolvedValue({
        id: 'sub_asaas_after_sync',
        status: 'ACTIVE',
      });

      await useCase.execute({
        subscriptionId: 'sub_sync_ok',
        remoteIp: '187.1.2.3',
        creditCardToken: 'tok_123',
      });

      expect(syncCustomerUseCaseMock.execute).toHaveBeenCalledWith({
        customerId: 'cust_unsynced',
        externalId: 'ext_unsynced_1',
      });
      expect(asaasClientMock.post).toHaveBeenCalledWith(
        '/v3/subscriptions',
        expect.objectContaining({
          customer: 'cus_synced_auto_999',
        }),
      );
    });

    it('não deve enviar nextDueDate ou externalReference quando forem undefined ou nulos', async () => {
      const subscription = {
        id: 'sub_no_due_date',
        customerId: 'cust_3',
        value: 199.9,
        cycle: 'YEARLY',
        nextDueDate: null,
        externalReference: null,
      };

      const customer = {
        id: 'cust_3',
        asaasCustomerId: 'cus_3',
      };

      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
      customerRepositoryMock.findById.mockResolvedValue(customer);
      asaasClientMock.post.mockResolvedValue({ id: 'sub_asaas_nodue' });

      await useCase.execute({
        subscriptionId: 'sub_no_due_date',
        remoteIp: '10.0.0.1',
        creditCardToken: 'tok_3',
      });

      expect(asaasClientMock.post).toHaveBeenCalledWith(
        '/v3/subscriptions',
        expect.not.objectContaining({
          nextDueDate: expect.anything(),
          externalReference: expect.anything(),
        }),
      );
    });

    it('não deve mutar o objeto de input passado por referência', async () => {
      const subscription = {
        id: 'sub_freeze',
        customerId: 'cust_freeze',
        value: 10.0,
        cycle: 'MONTHLY',
      };

      const customer = {
        id: 'cust_freeze',
        asaasCustomerId: 'cus_freeze',
      };

      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
      customerRepositoryMock.findById.mockResolvedValue(customer);
      asaasClientMock.post.mockResolvedValue({ id: 'sub_freeze_ok' });

      const input = Object.freeze({
        subscriptionId: 'sub_freeze',
        remoteIp: '10.0.0.1',
        creditCardToken: 'tok_freeze',
      });

      await expect(useCase.execute(input)).resolves.not.toThrow();
      expect(input.subscriptionId).toBe('sub_freeze');
    });
  });

  describe('3. Cenários de Falha e Exceção', () => {
    it('deve retornar precocemente se a assinatura não existir no banco de dados', async () => {
      subscriptionRepositoryMock.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({
          subscriptionId: 'sub_missing',
          remoteIp: '10.0.0.1',
        }),
      ).resolves.not.toThrow();

      expect(customerRepositoryMock.findById).not.toHaveBeenCalled();
      expect(asaasClientMock.post).not.toHaveBeenCalled();
      expect(subscriptionRepositoryMock.updateStatus).not.toHaveBeenCalled();
    });

    it('deve marcar FAILED se o cliente associado não for encontrado no banco', async () => {
      const subscription = {
        id: 'sub_no_client',
        customerId: 'cust_ghost',
      };

      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
      customerRepositoryMock.findById.mockResolvedValue(null);

      await useCase.execute({
        subscriptionId: 'sub_no_client',
        remoteIp: '10.0.0.1',
      });

      expect(subscriptionRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'sub_no_client',
        'FAILED',
        'Cliente associado à assinatura não localizado',
      );
      expect(asaasClientMock.post).not.toHaveBeenCalled();
    });

    it('deve marcar FAILED se a sincronização do cliente falhar e permanecer sem asaasCustomerId', async () => {
      const subscription = {
        id: 'sub_sync_fail',
        customerId: 'cust_sync_fail',
      };

      const customerWithoutAsaas = {
        id: 'cust_sync_fail',
        externalId: 'ext_fail',
        asaasCustomerId: null,
      };

      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
      customerRepositoryMock.findById.mockResolvedValue(customerWithoutAsaas);

      await useCase.execute({
        subscriptionId: 'sub_sync_fail',
        remoteIp: '10.0.0.1',
      });

      expect(syncCustomerUseCaseMock.execute).toHaveBeenCalled();
      expect(subscriptionRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'sub_sync_fail',
        'FAILED',
        'Não foi possível sincronizar o cliente no Asaas',
      );
      expect(asaasClientMock.post).not.toHaveBeenCalled();
    });

    it('deve capturar AsaasBadRequestException (rejeição de cartão), salvar status FAILED e NÃO relançar', async () => {
      const subscription = {
        id: 'sub_card_rejected',
        customerId: 'cust_rej',
        value: 59.9,
        cycle: 'MONTHLY',
      };

      const customer = {
        id: 'cust_rej',
        asaasCustomerId: 'cus_rej',
      };

      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
      customerRepositoryMock.findById.mockResolvedValue(customer);

      asaasClientMock.post.mockRejectedValue(
        new AsaasBadRequestException('Cartão de crédito com limite insuficiente'),
      );

      await expect(
        useCase.execute({
          subscriptionId: 'sub_card_rejected',
          remoteIp: '187.12.34.56',
          creditCardToken: 'tok_fail',
        }),
      ).resolves.not.toThrow();

      expect(subscriptionRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'sub_card_rejected',
        'FAILED',
        'Cartão de crédito com limite insuficiente',
      );

      expect(eventPublisherMock.publish).toHaveBeenCalledWith(
        'webhook.forward_to_client',
        {
          event: 'SUBSCRIPTION_FAILED',
          subscription: {
            id: 'sub_card_rejected',
            status: 'FAILED',
            failureReason: 'Cartão de crédito com limite insuficiente',
          },
        },
      );
    });

    it('deve capturar erro de gateway/rede (5xx), atualizar status FAILED e RELANÇAR para retry no RabbitMQ', async () => {
      const subscription = {
        id: 'sub_gateway_fail',
        customerId: 'cust_gw',
        value: 59.9,
        cycle: 'MONTHLY',
      };

      const customer = {
        id: 'cust_gw',
        asaasCustomerId: 'cus_gw',
      };

      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
      customerRepositoryMock.findById.mockResolvedValue(customer);

      const gatewayError = new AsaasGatewayException('Asaas Gateway 503 Service Unavailable', 503);
      asaasClientMock.post.mockRejectedValue(gatewayError);

      await expect(
        useCase.execute({
          subscriptionId: 'sub_gateway_fail',
          remoteIp: '187.12.34.56',
          creditCardToken: 'tok_retry',
        }),
      ).rejects.toThrow(AsaasGatewayException);

      expect(subscriptionRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'sub_gateway_fail',
        'FAILED',
        'Asaas Gateway 503 Service Unavailable',
      );

      expect(eventPublisherMock.publish).toHaveBeenCalledWith(
        'webhook.forward_to_client',
        {
          event: 'SUBSCRIPTION_FAILED',
          subscription: {
            id: 'sub_gateway_fail',
            status: 'FAILED',
            failureReason: 'Asaas Gateway 503 Service Unavailable',
          },
        },
      );
    });
  });

  describe('4. Segurança e Integridade das Regras de Negócio', () => {
    it('deve priorizar creditCardToken em detrimento de dados brutos de cartão quando ambos forem passados', async () => {
      const subscription = {
        id: 'sub_prio_test',
        customerId: 'cust_prio',
        value: 100.0,
        cycle: 'MONTHLY',
      };

      const customer = {
        id: 'cust_prio',
        asaasCustomerId: 'cus_prio',
      };

      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
      customerRepositoryMock.findById.mockResolvedValue(customer);
      asaasClientMock.post.mockResolvedValue({ id: 'sub_prio_ok' });

      await useCase.execute({
        subscriptionId: 'sub_prio_test',
        remoteIp: '1.2.3.4',
        creditCardToken: 'token_preferencial',
        creditCard: {
          holderName: 'RAW HOLDER',
          number: '4000000000000000',
          expiryMonth: '05',
          expiryYear: '2030',
          ccv: '123',
        },
      });

      expect(asaasClientMock.post).toHaveBeenCalledWith(
        '/v3/subscriptions',
        expect.objectContaining({
          creditCardToken: 'token_preferencial',
        }),
      );
      expect(asaasClientMock.post).toHaveBeenCalledWith(
        '/v3/subscriptions',
        expect.not.objectContaining({
          creditCard: expect.anything(),
        }),
      );
    });
  });
});
