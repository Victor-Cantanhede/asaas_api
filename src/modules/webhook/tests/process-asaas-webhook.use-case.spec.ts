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

  it('should update payment escrow status when webhook contains escrow data or ESCROW_FINISHED event', async () => {
    webhookEventRepoMock.findByEventId.mockResolvedValue(null);
    paymentRepoMock.findByAsaasPaymentId.mockResolvedValue({ id: 'pay_local_escrow' });

    const payload = {
      id: 'evt_escrow_1',
      event: 'ESCROW_FINISHED',
      payment: {
        id: 'pay_asaas_escrow',
        escrow: {
          status: 'FINISHED',
          finishDate: '2026-09-17T18:00:00.000Z',
        },
      },
    };

    const result = await useCase.execute(payload as any);

    expect(result.isDuplicate).toBe(false);
    expect(paymentRepoMock.update).toHaveBeenCalledWith(
      'pay_local_escrow',
      expect.objectContaining({
        escrowStatus: 'FINISHED',
        escrowFinishDate: new Date('2026-09-17T18:00:00.000Z'),
      }),
    );
  });

  it('should process TRANSFER_DONE webhook event, infer transfer entityId and mark processed', async () => {
    webhookEventRepoMock.findByEventId.mockResolvedValue(null);

    const payload = {
      event: 'TRANSFER_DONE',
      dateCreated: '2026-09-30 14:00:00',
      transfer: {
        id: 'trans_asaas_123',
        status: 'DONE',
        value: 150.0,
        netValue: 145.0,
        operationType: 'PIX',
        effectiveDate: '2026-09-30',
      },
    };

    const result = await useCase.execute(payload as any);

    expect(result.isDuplicate).toBe(false);
    expect(webhookEventRepoMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt_trans_asaas_123_TRANSFER_DONE_2026-09-30_14_00_00',
        event: 'TRANSFER_DONE',
      }),
    );
    expect(webhookEventRepoMock.markProcessed).toHaveBeenCalledWith('wh_evt_1');
  });

  it('should process TRANSFER_FAILED webhook event with failReason and mark processed', async () => {
    webhookEventRepoMock.findByEventId.mockResolvedValue(null);

    const payload = {
      id: 'evt_trans_fail_1',
      event: 'TRANSFER_FAILED',
      transfer: {
        id: 'trans_asaas_999',
        status: 'FAILED',
        value: 50.0,
        operationType: 'TED',
        failReason: 'Chave PIX ou agência/conta inexistente no banco destino',
      },
    };

    const result = await useCase.execute(payload as any);

    expect(result.isDuplicate).toBe(false);
    expect(webhookEventRepoMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt_trans_fail_1',
        event: 'TRANSFER_FAILED',
      }),
    );
    expect(webhookEventRepoMock.markProcessed).toHaveBeenCalledWith('wh_evt_1');
  });

  it('should process PAYMENT_SPLIT_DIVERGENCE_BLOCK event gracefully and mark processed', async () => {
    webhookEventRepoMock.findByEventId.mockResolvedValue(null);

    const payload = {
      id: 'evt_split_div_1',
      event: 'PAYMENT_SPLIT_DIVERGENCE_BLOCK',
      payment: {
        id: 'pay_asaas_split_div',
      },
    };

    const result = await useCase.execute(payload as any);

    expect(result.isDuplicate).toBe(false);
    expect(webhookEventRepoMock.markProcessed).toHaveBeenCalledWith('wh_evt_1');
  });
});
