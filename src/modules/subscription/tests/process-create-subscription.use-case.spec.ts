import { Test, TestingModule } from '@nestjs/testing';
import { ProcessCreateSubscriptionUseCase } from '../use-cases/process-create-subscription.use-case';
import { SUBSCRIPTION_REPOSITORY_TOKEN } from '../repositories/subscription.repository.interface';
import { CUSTOMER_REPOSITORY_TOKEN } from '../../customer/repositories/customer.repository.interface';
import { SyncCustomerUseCase } from '../../customer/use-cases/sync-customer.use-case';
import { AsaasClientProvider } from '../../../infra/asaas/asaas-client.provider';
import { EVENT_PUBLISHER_TOKEN } from '../../../infra/messaging/contracts/event-publisher.interface';
import { AsaasBadRequestException } from '../../../infra/asaas/errors';

describe('ProcessCreateSubscriptionUseCase', () => {
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

  it('should be defined', () => {
    expect(useCase).toBeDefined();
  });

  it('should create subscription in Asaas, update status to ACTIVE and publish notification', async () => {
    const subscription = {
      id: 'sub_1',
      customerId: 'cust_1',
      value: 59.9,
      cycle: 'MONTHLY',
      nextDueDate: new Date('2026-10-10T00:00:00.000Z'),
      externalReference: 'sub_ref_1001',
    };

    const customer = {
      id: 'cust_1',
      externalId: 'ext_1',
      asaasCustomerId: 'cus_sub_123',
    };

    subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
    customerRepositoryMock.findById.mockResolvedValue(customer);

    asaasClientMock.post.mockResolvedValue({
      id: 'sub_asaas_777',
      status: 'ACTIVE',
      creditCard: {
        creditCardToken: 'tok_gen_123',
        creditCardBrand: 'MASTERCARD',
        creditCardNumber: '4444',
      },
    });

    const input = {
      subscriptionId: 'sub_1',
      remoteIp: '187.12.34.56',
      creditCardToken: 'tok_gen_123',
    };

    await useCase.execute(input);

    expect(asaasClientMock.post).toHaveBeenCalledWith('/v3/subscriptions', {
      customer: 'cus_sub_123',
      billingType: 'CREDIT_CARD',
      value: 59.9,
      cycle: 'MONTHLY',
      nextDueDate: '2026-10-10',
      remoteIp: '187.12.34.56',
      externalReference: 'sub_ref_1001',
      creditCardToken: 'tok_gen_123',
    });

    expect(subscriptionRepositoryMock.update).toHaveBeenCalledWith('sub_1', {
      asaasSubscriptionId: 'sub_asaas_777',
      status: 'ACTIVE',
      creditCardToken: 'tok_gen_123',
      creditCardBrand: 'MASTERCARD',
      creditCardLast4: '4444',
      failureReason: null,
    });

    expect(eventPublisherMock.publish).toHaveBeenCalledWith(
      'webhook.forward_to_client',
      expect.objectContaining({
        event: 'SUBSCRIPTION_CREATED',
      }),
    );
  });

  it('should handle AsaasBadRequestException by setting FAILED status without rethrowing', async () => {
    const subscription = {
      id: 'sub_2',
      customerId: 'cust_2',
      value: 59.9,
      cycle: 'MONTHLY',
    };

    const customer = {
      id: 'cust_2',
      externalId: 'ext_2',
      asaasCustomerId: 'cus_sub_456',
    };

    subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
    customerRepositoryMock.findById.mockResolvedValue(customer);

    asaasClientMock.post.mockRejectedValue(
      new AsaasBadRequestException('Cartão de crédito com limite insuficiente'),
    );

    await expect(
      useCase.execute({
        subscriptionId: 'sub_2',
        remoteIp: '187.12.34.56',
        creditCardToken: 'tok_fail',
      }),
    ).resolves.not.toThrow();

    expect(subscriptionRepositoryMock.updateStatus).toHaveBeenCalledWith(
      'sub_2',
      'FAILED',
      'Cartão de crédito com limite insuficiente',
    );
  });
});
