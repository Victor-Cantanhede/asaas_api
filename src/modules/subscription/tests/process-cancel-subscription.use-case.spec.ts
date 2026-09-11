import { Test, TestingModule } from '@nestjs/testing';
import { ProcessCancelSubscriptionUseCase } from '../use-cases/process-cancel-subscription.use-case';
import { SUBSCRIPTION_REPOSITORY_TOKEN } from '../repositories/subscription.repository.interface';
import { AsaasClientProvider } from '../../../infra/asaas/asaas-client.provider';
import { EVENT_PUBLISHER_TOKEN } from '../../../infra/messaging/contracts/event-publisher.interface';

describe('ProcessCancelSubscriptionUseCase', () => {
  let useCase: ProcessCancelSubscriptionUseCase;
  let subscriptionRepositoryMock: any;
  let asaasClientMock: any;
  let eventPublisherMock: any;

  beforeEach(async () => {
    subscriptionRepositoryMock = {
      findById: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    };

    asaasClientMock = {
      delete: jest.fn().mockResolvedValue({ deleted: true }),
    };

    eventPublisherMock = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessCancelSubscriptionUseCase,
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

    useCase = module.get<ProcessCancelSubscriptionUseCase>(
      ProcessCancelSubscriptionUseCase,
    );
  });

  it('should be defined', () => {
    expect(useCase).toBeDefined();
  });

  it('should delete subscription in Asaas, update local status to INACTIVE and publish notification', async () => {
    const subscription = {
      id: 'sub_123',
      asaasSubscriptionId: 'sub_asaas_123',
      status: 'ACTIVE',
    };

    subscriptionRepositoryMock.findById.mockResolvedValue(subscription);

    await useCase.execute({ subscriptionId: 'sub_123' });

    expect(asaasClientMock.delete).toHaveBeenCalledWith(
      '/v3/subscriptions/sub_asaas_123',
    );
    expect(subscriptionRepositoryMock.updateStatus).toHaveBeenCalledWith(
      'sub_123',
      'INACTIVE',
      null,
    );
    expect(eventPublisherMock.publish).toHaveBeenCalledWith(
      'webhook.forward_to_client',
      expect.objectContaining({
        event: 'SUBSCRIPTION_INACTIVATED',
      }),
    );
  });
});
