import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WebhookController } from '../webhook.controller';
import { EVENT_PUBLISHER_TOKEN } from '../../../infra/messaging/contracts/event-publisher.interface';
import { AsaasWebhookPayloadDto } from '../dto/asaas-webhook-payload.dto';

describe('WebhookController', () => {
  let controller: WebhookController;
  let eventPublisherMock: any;

  beforeEach(async () => {
    eventPublisherMock = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        {
          provide: EVENT_PUBLISHER_TOKEN,
          useValue: eventPublisherMock,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('webhook_secret_123') },
        },
      ],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should publish webhook.received and return 200 OK immediately', async () => {
    const payload: AsaasWebhookPayloadDto = {
      id: 'evt_123',
      event: 'PAYMENT_CONFIRMED',
      payment: { id: 'pay_123' },
    };

    const response = await controller.receiveAsaasWebhook(payload);

    expect(eventPublisherMock.publish).toHaveBeenCalledWith(
      'webhook.received',
      payload,
    );
    expect(response).toEqual({
      received: true,
      message:
        'Webhook recebido com sucesso e enfileirado para processamento assíncrono.',
    });
  });

  it('should accept webhook with account and complex nested split object', async () => {
    const payload: AsaasWebhookPayloadDto = {
      id: 'evt_d26e303b238e509335ac9ba210e51b0f&20598710',
      event: 'PAYMENT_RECEIVED',
      dateCreated: '2026-09-29 17:25:12',
      account: {
        id: '24c199c1-77b9-46a5-9ccf-870231cc1eb4',
        ownerId: null,
      },
      payment: {
        id: 'pay_2bsk77vcygishn6v',
        status: 'RECEIVED',
        value: 17500.0,
      },
    };

    const response = await controller.receiveAsaasWebhook(payload);

    expect(eventPublisherMock.publish).toHaveBeenCalledWith(
      'webhook.received',
      payload,
    );
    expect(response.received).toBe(true);
  });
});
