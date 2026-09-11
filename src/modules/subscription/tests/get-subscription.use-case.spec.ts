import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GetSubscriptionUseCase } from '../use-cases/get-subscription.use-case';
import { SUBSCRIPTION_REPOSITORY_TOKEN } from '../repositories/subscription.repository.interface';

describe('GetSubscriptionUseCase', () => {
  let useCase: GetSubscriptionUseCase;
  let repositoryMock: any;

  beforeEach(async () => {
    repositoryMock = {
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetSubscriptionUseCase,
        {
          provide: SUBSCRIPTION_REPOSITORY_TOKEN,
          useValue: repositoryMock,
        },
      ],
    }).compile();

    useCase = module.get<GetSubscriptionUseCase>(GetSubscriptionUseCase);
  });

  it('should return subscription details when found', async () => {
    const subscription = {
      id: 'sub_123',
      customerId: 'cust_123',
      asaasSubscriptionId: 'sub_asaas_123',
      externalReference: 'ref_1',
      billingType: 'CREDIT_CARD',
      status: 'ACTIVE',
      cycle: 'MONTHLY',
      value: 59.9,
      nextDueDate: new Date('2026-10-10T00:00:00.000Z'),
      creditCardToken: 'tok_1',
      creditCardBrand: 'VISA',
      creditCardLast4: '1234',
      failureReason: null,
      createdAt: new Date('2026-09-10T15:30:00.000Z'),
      updatedAt: new Date('2026-09-10T15:30:02.000Z'),
    };

    repositoryMock.findById.mockResolvedValue(subscription);

    const result = await useCase.execute('sub_123');

    expect(repositoryMock.findById).toHaveBeenCalledWith('sub_123');
    expect(result).toEqual(subscription);
  });

  it('should throw NotFoundException when subscription does not exist', async () => {
    repositoryMock.findById.mockResolvedValue(null);

    await expect(useCase.execute('unknown_id')).rejects.toThrow(
      NotFoundException,
    );
  });
});
