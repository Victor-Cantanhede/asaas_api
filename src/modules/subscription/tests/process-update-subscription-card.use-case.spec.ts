import { Test, TestingModule } from '@nestjs/testing';
import { ProcessUpdateSubscriptionCardUseCase } from '../use-cases/process-update-subscription-card.use-case';
import { SUBSCRIPTION_REPOSITORY_TOKEN } from '../repositories/subscription.repository.interface';
import { AsaasClientProvider } from '../../../infra/asaas/asaas-client.provider';
import { EVENT_PUBLISHER_TOKEN } from '../../../infra/messaging/contracts/event-publisher.interface';

describe('ProcessUpdateSubscriptionCardUseCase', () => {
  let useCase: ProcessUpdateSubscriptionCardUseCase;
  let subscriptionRepositoryMock: any;
  let asaasClientMock: any;
  let eventPublisherMock: any;

  beforeEach(async () => {
    subscriptionRepositoryMock = {
      findById: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };

    asaasClientMock = {
      put: jest.fn(),
    };

    eventPublisherMock = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessUpdateSubscriptionCardUseCase,
        {
          provide: SUBSCRIPTION_REPOSITORY_TOKEN,
          useValue: subscriptionRepositoryMock,
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

    useCase = module.get<ProcessUpdateSubscriptionCardUseCase>(
      ProcessUpdateSubscriptionCardUseCase,
    );
  });

  it('should be defined', () => {
    expect(useCase).toBeDefined();
  });

  it('should update credit card in Asaas and update local subscription record', async () => {
    const subscription = {
      id: 'sub_1',
      asaasSubscriptionId: 'sub_asaas_123',
    };

    subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
    asaasClientMock.put.mockResolvedValue({
      creditCard: {
        creditCardToken: 'new_token_789',
        creditCardBrand: 'VISA',
        creditCardNumber: '9999',
      },
    });

    const input = {
      subscriptionId: 'sub_1',
      remoteIp: '187.12.34.56',
      creditCardToken: 'new_token_789',
    };

    await useCase.execute(input);

    expect(asaasClientMock.put).toHaveBeenCalledWith(
      '/v3/subscriptions/sub_asaas_123/creditCard',
      {
        remoteIp: '187.12.34.56',
        creditCardToken: 'new_token_789',
      },
    );

    expect(subscriptionRepositoryMock.update).toHaveBeenCalledWith('sub_1', {
      creditCardToken: 'new_token_789',
      creditCardBrand: 'VISA',
      creditCardLast4: '9999',
      failureReason: null,
    });

    expect(eventPublisherMock.publish).toHaveBeenCalledWith(
      'webhook.forward_to_client',
      expect.objectContaining({
        event: 'SUBSCRIPTION_CARD_UPDATED',
      }),
    );
  });
});
