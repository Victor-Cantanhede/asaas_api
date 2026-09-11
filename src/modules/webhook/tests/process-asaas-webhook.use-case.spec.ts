import { Test, TestingModule } from '@nestjs/testing';
import { ProcessAsaasWebhookUseCase } from '../use-cases/process-asaas-webhook.use-case';
import { WEBHOOK_EVENT_REPOSITORY_TOKEN } from '../repositories/webhook-event.repository.interface';
import { PAYMENT_REPOSITORY_TOKEN } from '../../payment/repositories/payment.repository.interface';
import { SUBSCRIPTION_REPOSITORY_TOKEN } from '../../subscription/repositories/subscription.repository.interface';

describe('ProcessAsaasWebhookUseCase', () => {
  let useCase: ProcessAsaasWebhookUseCase;
  let webhookEventRepoMock: any;
  let paymentRepoMock: any;
  let subscriptionRepoMock: any;

  beforeEach(async () => {
    webhookEventRepoMock = {
      findByEventId: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'wh_evt_1' }),
      markProcessed: jest.fn().mockResolvedValue({}),
    };

    paymentRepoMock = {
      findByAsaasPaymentId: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };

    subscriptionRepoMock = {
      findByAsaasSubscriptionId: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessAsaasWebhookUseCase,
        {
          provide: WEBHOOK_EVENT_REPOSITORY_TOKEN,
          useValue: webhookEventRepoMock,
        },
        {
          provide: PAYMENT_REPOSITORY_TOKEN,
          useValue: paymentRepoMock,
        },
        {
          provide: SUBSCRIPTION_REPOSITORY_TOKEN,
          useValue: subscriptionRepoMock,
        },
      ],
    }).compile();

    useCase = module.get<ProcessAsaasWebhookUseCase>(
      ProcessAsaasWebhookUseCase,
    );
  });

  it('should be defined', () => {
    expect(useCase).toBeDefined();
  });

  it('should return isDuplicate: true and avoid processing when eventId already exists', async () => {
    webhookEventRepoMock.findByEventId.mockResolvedValue({ id: 'existing_evt' });

    const result = await useCase.execute({
      id: 'evt_dup_1',
      event: 'PAYMENT_RECEIVED',
    });

    expect(result.isDuplicate).toBe(true);
    expect(webhookEventRepoMock.create).not.toHaveBeenCalled();
    expect(paymentRepoMock.update).not.toHaveBeenCalled();
  });

  it('should process payment webhook event and update local payment status', async () => {
    webhookEventRepoMock.findByEventId.mockResolvedValue(null);
    paymentRepoMock.findByAsaasPaymentId.mockResolvedValue({ id: 'pay_local_1' });

    const payload = {
      id: 'evt_pay_1',
      event: 'PAYMENT_CONFIRMED',
      payment: {
        id: 'pay_asaas_1',
        status: 'CONFIRMED',
        netValue: 148.0,
        paymentDate: '2026-09-10',
      },
    };

    const result = await useCase.execute(payload);

    expect(result.isDuplicate).toBe(false);
    expect(webhookEventRepoMock.create).toHaveBeenCalledWith({
      eventId: 'evt_pay_1',
      event: 'PAYMENT_CONFIRMED',
      asaasPaymentId: 'pay_asaas_1',
      payload: JSON.stringify(payload),
    });
    expect(paymentRepoMock.update).toHaveBeenCalledWith('pay_local_1', {
      status: 'CONFIRMED',
      netValue: 148.0,
      paymentDate: new Date('2026-09-10'),
    });
    expect(webhookEventRepoMock.markProcessed).toHaveBeenCalledWith('wh_evt_1');
  });

  it('should process subscription webhook event and update local subscription status', async () => {
    webhookEventRepoMock.findByEventId.mockResolvedValue(null);
    subscriptionRepoMock.findByAsaasSubscriptionId.mockResolvedValue({
      id: 'sub_local_1',
    });

    const payload = {
      id: 'evt_sub_1',
      event: 'SUBSCRIPTION_UPDATED',
      subscription: {
        id: 'sub_asaas_1',
        status: 'ACTIVE',
        nextDueDate: '2026-10-10',
      },
    };

    const result = await useCase.execute(payload);

    expect(result.isDuplicate).toBe(false);
    expect(subscriptionRepoMock.update).toHaveBeenCalledWith('sub_local_1', {
      status: 'ACTIVE',
      nextDueDate: new Date('2026-10-10'),
    });
    expect(webhookEventRepoMock.markProcessed).toHaveBeenCalledWith('wh_evt_1');
  });
});
