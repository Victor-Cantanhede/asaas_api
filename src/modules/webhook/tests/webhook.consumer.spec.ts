import { Test, TestingModule } from '@nestjs/testing';
import { WebhookConsumer } from '../consumers/webhook.consumer';
import { ProcessAsaasWebhookUseCase } from '../use-cases/process-asaas-webhook.use-case';
import { EVENT_PUBLISHER_TOKEN } from '../../../infra/messaging/contracts/event-publisher.interface';
import { RmqContext } from '@nestjs/microservices';

describe('WebhookConsumer', () => {
  let consumer: WebhookConsumer;
  let processWebhookUseCaseMock: any;
  let eventPublisherMock: any;
  let channelMock: any;
  let contextMock: any;

  beforeEach(async () => {
    processWebhookUseCaseMock = {
      execute: jest.fn(),
    };

    eventPublisherMock = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    channelMock = {
      ack: jest.fn(),
      nack: jest.fn(),
    };

    contextMock = {
      getChannelRef: jest.fn().mockReturnValue(channelMock),
      getMessage: jest.fn().mockReturnValue({ content: 'raw_msg' }),
    } as unknown as RmqContext;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookConsumer],
      providers: [
        {
          provide: ProcessAsaasWebhookUseCase,
          useValue: processWebhookUseCaseMock,
        },
        {
          provide: EVENT_PUBLISHER_TOKEN,
          useValue: eventPublisherMock,
        },
      ],
    }).compile();

    consumer = module.get<WebhookConsumer>(WebhookConsumer);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  it('should process new webhook, publish webhook.forward_to_client and ack message', async () => {
    const payload = {
      id: 'evt_new_1',
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_1' },
    };

    processWebhookUseCaseMock.execute.mockResolvedValue({
      isDuplicate: false,
      webhookEvent: { id: 'local_evt_1' },
    });

    await consumer.handleWebhookReceived(payload as any, contextMock);

    expect(processWebhookUseCaseMock.execute).toHaveBeenCalledWith(payload);
    expect(eventPublisherMock.publish).toHaveBeenCalledWith(
      'webhook.forward_to_client',
      payload,
    );
    expect(channelMock.ack).toHaveBeenCalled();
  });

  it('should discard duplicate event idempotently without publishing forward', async () => {
    const payload = {
      id: 'evt_duplicate_2',
      event: 'PAYMENT_RECEIVED',
    };

    processWebhookUseCaseMock.execute.mockResolvedValue({
      isDuplicate: true,
      webhookEvent: { id: 'existing_evt_2' },
    });

    await consumer.handleWebhookReceived(payload as any, contextMock);

    expect(processWebhookUseCaseMock.execute).toHaveBeenCalledWith(payload);
    expect(eventPublisherMock.publish).not.toHaveBeenCalled();
    expect(channelMock.ack).toHaveBeenCalled();
  });
});
