import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SubscriptionController } from '../subscription.controller';
import { SUBSCRIPTION_REPOSITORY_TOKEN } from '../repositories/subscription.repository.interface';
import { CUSTOMER_REPOSITORY_TOKEN } from '../../customer/repositories/customer.repository.interface';
import { EVENT_PUBLISHER_TOKEN } from '../../../infra/messaging/contracts/event-publisher.interface';
import { GetSubscriptionUseCase } from '../use-cases/get-subscription.use-case';

describe('SubscriptionController', () => {
  let controller: SubscriptionController;
  let subscriptionRepositoryMock: any;
  let customerRepositoryMock: any;
  let eventPublisherMock: any;
  let getSubscriptionUseCaseMock: any;

  beforeEach(async () => {
    subscriptionRepositoryMock = {
      createInitial: jest.fn().mockResolvedValue({
        id: 'sub_123',
        status: 'RECEIVED',
        createdAt: new Date('2026-09-10T15:30:00.000Z'),
      }),
      findById: jest.fn(),
    };

    customerRepositoryMock = {
      findById: jest.fn().mockResolvedValue({
        id: 'cust_123',
        externalId: 'ext_123',
      }),
      findByExternalId: jest.fn(),
    };

    eventPublisherMock = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    getSubscriptionUseCaseMock = {
      execute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionController],
      providers: [
        {
          provide: SUBSCRIPTION_REPOSITORY_TOKEN,
          useValue: subscriptionRepositoryMock,
        },
        {
          provide: CUSTOMER_REPOSITORY_TOKEN,
          useValue: customerRepositoryMock,
        },
        {
          provide: EVENT_PUBLISHER_TOKEN,
          useValue: eventPublisherMock,
        },
        {
          provide: GetSubscriptionUseCase,
          useValue: getSubscriptionUseCaseMock,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test_key') },
        },
      ],
    }).compile();

    controller = module.get<SubscriptionController>(SubscriptionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('POST /subscriptions: should create initial record and publish subscription.create returning 202', async () => {
    const dto = {
      customerId: 'cust_123',
      value: 59.9,
      cycle: 'MONTHLY',
      remoteIp: '187.12.34.56',
      creditCardToken: 'card_tok_123',
    };

    const response = await controller.createSubscription(dto as any);

    expect(subscriptionRepositoryMock.createInitial).toHaveBeenCalled();
    expect(eventPublisherMock.publish).toHaveBeenCalledWith(
      'subscription.create',
      expect.objectContaining({
        subscriptionId: 'sub_123',
        remoteIp: '187.12.34.56',
        creditCardToken: 'card_tok_123',
      }),
    );
    expect(response.status).toBe('RECEIVED');
    expect(response.trackingId).toBe('sub_123');
  });

  it('PUT /subscriptions/:id/credit-card: should publish subscription.update_card and return 202', async () => {
    subscriptionRepositoryMock.findById.mockResolvedValue({
      id: 'sub_123',
      status: 'ACTIVE',
    });

    const dto = {
      remoteIp: '187.12.34.56',
      creditCardToken: 'new_token_456',
    };

    const response = await controller.updateSubscriptionCard('sub_123', dto as any);

    expect(eventPublisherMock.publish).toHaveBeenCalledWith(
      'subscription.update_card',
      expect.objectContaining({
        subscriptionId: 'sub_123',
        creditCardToken: 'new_token_456',
      }),
    );
    expect(response.trackingId).toBe('sub_123');
    expect(response.status).toBe('ACTIVE');
  });

  it('DELETE /subscriptions/:id: should publish subscription.cancel and return 202', async () => {
    subscriptionRepositoryMock.findById.mockResolvedValue({
      id: 'sub_123',
      status: 'ACTIVE',
    });

    const response = await controller.cancelSubscription('sub_123');

    expect(eventPublisherMock.publish).toHaveBeenCalledWith(
      'subscription.cancel',
      { subscriptionId: 'sub_123' },
    );
    expect(response.trackingId).toBe('sub_123');
  });

  it('GET /subscriptions/:id: should delegate to GetSubscriptionUseCase', async () => {
    getSubscriptionUseCaseMock.execute.mockResolvedValue({
      id: 'sub_123',
      status: 'ACTIVE',
      value: 59.9,
    });

    const result = await controller.getSubscriptionById('sub_123');

    expect(getSubscriptionUseCaseMock.execute).toHaveBeenCalledWith('sub_123');
    expect(result.id).toBe('sub_123');
  });

  it('should encrypt creditCard into encryptedCreditCard and omit plaintext card on subscription create and update', async () => {
    const cardEncryptionServiceMock = {
      encrypt: jest.fn().mockReturnValue('iv_sub:tag_sub:cipher_sub'),
    };

    const secureController = new SubscriptionController(
      subscriptionRepositoryMock,
      customerRepositoryMock,
      eventPublisherMock,
      getSubscriptionUseCaseMock,
      cardEncryptionServiceMock as any,
    );

    const rawCard = {
      holderName: 'CHARLIE BROWN',
      number: '4333333333333333',
      expiryMonth: '05',
      expiryYear: '2027',
      ccv: '777',
    };

    // 1. Create subscription
    await secureController.createSubscription({
      customerId: 'cust_123',
      value: 79.9,
      cycle: 'MONTHLY',
      remoteIp: '187.12.34.56',
      creditCard: rawCard,
    } as any);

    expect(cardEncryptionServiceMock.encrypt).toHaveBeenCalledWith(rawCard);
    expect(eventPublisherMock.publish).toHaveBeenCalledWith(
      'subscription.create',
      expect.objectContaining({
        subscriptionId: 'sub_123',
        creditCard: undefined,
        encryptedCreditCard: 'iv_sub:tag_sub:cipher_sub',
      }),
    );

    // 2. Update subscription card
    subscriptionRepositoryMock.findById.mockResolvedValue({ id: 'sub_123', status: 'ACTIVE' });
    await secureController.updateSubscriptionCard('sub_123', {
      remoteIp: '187.12.34.56',
      creditCard: rawCard,
    } as any);

    expect(eventPublisherMock.publish).toHaveBeenCalledWith(
      'subscription.update_card',
      expect.objectContaining({
        subscriptionId: 'sub_123',
        creditCard: undefined,
        encryptedCreditCard: 'iv_sub:tag_sub:cipher_sub',
      }),
    );
  });
});

