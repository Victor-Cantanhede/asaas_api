import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WebhookForwarderConsumer } from '../consumers/webhook-forwarder.consumer';
import { WEBHOOK_EVENT_REPOSITORY_TOKEN } from '../repositories/webhook-event.repository.interface';
import { RmqContext } from '@nestjs/microservices';

describe('WebhookForwarderConsumer', () => {
  let consumer: WebhookForwarderConsumer;
  let configServiceMock: any;
  let repositoryMock: any;
  let channelMock: any;
  let contextMock: any;
  let originalFetch: typeof global.fetch;

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(async () => {
    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'CLIENT_WEBHOOK_URL') return 'http://consumer-api.test/webhook';
        if (key === 'CLIENT_WEBHOOK_SECRET') return 'secret_client_123';
        return null;
      }),
    };

    repositoryMock = {
      findByEventId: jest.fn(),
      updateForwardStatus: jest.fn().mockResolvedValue({}),
    };

    channelMock = {
      ack: jest.fn(),
    };

    contextMock = {
      getChannelRef: jest.fn().mockReturnValue(channelMock),
      getMessage: jest.fn().mockReturnValue({ content: 'msg' }),
    } as unknown as RmqContext;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookForwarderConsumer],
      providers: [
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
        {
          provide: WEBHOOK_EVENT_REPOSITORY_TOKEN,
          useValue: repositoryMock,
        },
      ],
    }).compile();

    consumer = module.get<WebhookForwarderConsumer>(WebhookForwarderConsumer);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  it('should forward payload to CLIENT_WEBHOOK_URL with x-webhook-secret header and update forwardStatus to FORWARDED', async () => {
    repositoryMock.findByEventId.mockResolvedValue({ id: 'local_evt_1' });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as any);

    const payload = { id: 'evt_123', event: 'PAYMENT_RECEIVED' };

    await consumer.handleForwardToClient(payload, contextMock);

    expect(global.fetch).toHaveBeenCalledWith('http://consumer-api.test/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': 'secret_client_123',
      },
      body: JSON.stringify(payload),
    });

    expect(repositoryMock.updateForwardStatus).toHaveBeenCalledWith(
      'local_evt_1',
      'FORWARDED',
      null,
    );
    expect(channelMock.ack).toHaveBeenCalled();
  });

  it('should record FAILED forwardStatus when consumer responds with 500 error', async () => {
    repositoryMock.findByEventId.mockResolvedValue({ id: 'local_evt_2' });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as any);

    const payload = { id: 'evt_fail_1' };

    await consumer.handleForwardToClient(payload, contextMock);

    expect(repositoryMock.updateForwardStatus).toHaveBeenCalledWith(
      'local_evt_2',
      'FAILED',
      expect.stringContaining('500'),
    );
    expect(channelMock.ack).toHaveBeenCalled();
  });

  it('should skip forwarding if CLIENT_WEBHOOK_URL is not configured', async () => {
    configServiceMock.get.mockReturnValue(null);
    global.fetch = jest.fn();

    await consumer.handleForwardToClient({ id: 'evt_noop' }, contextMock);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(channelMock.ack).toHaveBeenCalled();
  });
});
