import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionConsumer } from '../consumers/subscription.consumer';
import { ProcessCreateSubscriptionUseCase } from '../use-cases/process-create-subscription.use-case';
import { ProcessUpdateSubscriptionCardUseCase } from '../use-cases/process-update-subscription-card.use-case';
import { ProcessCancelSubscriptionUseCase } from '../use-cases/process-cancel-subscription.use-case';
import { RmqContext } from '@nestjs/microservices';
import { AsaasGatewayException } from '../../../infra/asaas/errors';

describe('SubscriptionConsumer', () => {
  let consumer: SubscriptionConsumer;
  let createUseCaseMock: any;
  let updateCardUseCaseMock: any;
  let cancelUseCaseMock: any;
  let channelMock: any;
  let contextMock: any;

  beforeEach(async () => {
    createUseCaseMock = { execute: jest.fn().mockResolvedValue(undefined) };
    updateCardUseCaseMock = { execute: jest.fn().mockResolvedValue(undefined) };
    cancelUseCaseMock = { execute: jest.fn().mockResolvedValue(undefined) };

    channelMock = {
      ack: jest.fn(),
      nack: jest.fn(),
    };

    contextMock = {
      getChannelRef: jest.fn().mockReturnValue(channelMock),
      getMessage: jest.fn().mockReturnValue({ content: 'msg_sub' }),
    } as unknown as RmqContext;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionConsumer],
      providers: [
        {
          provide: ProcessCreateSubscriptionUseCase,
          useValue: createUseCaseMock,
        },
        {
          provide: ProcessUpdateSubscriptionCardUseCase,
          useValue: updateCardUseCaseMock,
        },
        {
          provide: ProcessCancelSubscriptionUseCase,
          useValue: cancelUseCaseMock,
        },
      ],
    }).compile();

    consumer = module.get<SubscriptionConsumer>(SubscriptionConsumer);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  it('should handle subscription.create and ack message', async () => {
    const payload = {
      subscriptionId: 'sub_1',
      remoteIp: '127.0.0.1',
      creditCardToken: 'tok_1',
    };

    await consumer.handleCreateSubscription(payload, contextMock);

    expect(createUseCaseMock.execute).toHaveBeenCalledWith(payload);
    expect(channelMock.ack).toHaveBeenCalled();
  });

  it('should handle subscription.update_card and ack message', async () => {
    const payload = {
      subscriptionId: 'sub_1',
      remoteIp: '127.0.0.1',
      creditCardToken: 'tok_new',
    };

    await consumer.handleUpdateSubscriptionCard(payload, contextMock);

    expect(updateCardUseCaseMock.execute).toHaveBeenCalledWith(payload);
    expect(channelMock.ack).toHaveBeenCalled();
  });

  it('should handle subscription.cancel and ack message', async () => {
    const payload = { subscriptionId: 'sub_1' };

    await consumer.handleCancelSubscription(payload, contextMock);

    expect(cancelUseCaseMock.execute).toHaveBeenCalledWith(payload);
    expect(channelMock.ack).toHaveBeenCalled();
  });

  it('should requeue message via nack when transient AsaasGatewayException occurs', async () => {
    createUseCaseMock.execute.mockRejectedValue(
      new AsaasGatewayException('Asaas timeout', 504),
    );

    const payload = {
      subscriptionId: 'sub_1',
      remoteIp: '127.0.0.1',
      creditCardToken: 'tok_1',
    };

    await consumer.handleCreateSubscription(payload, contextMock);

    expect(channelMock.nack).toHaveBeenCalledWith({ content: 'msg_sub' }, false, true);
    expect(channelMock.ack).not.toHaveBeenCalled();
  });

  it('should decrypt encryptedCreditCard in create and update_card handlers when present', async () => {
    const rawCard = {
      holderName: 'DANNY OCEAN',
      number: '4444444444444444',
      expiryMonth: '08',
      expiryYear: '2028',
      ccv: '555',
    };

    const cardEncryptionServiceMock = {
      decrypt: jest.fn().mockReturnValue(rawCard),
    };

    const secureConsumer = new SubscriptionConsumer(
      createUseCaseMock,
      updateCardUseCaseMock,
      cancelUseCaseMock,
      cardEncryptionServiceMock as any,
    );

    // 1. handleCreateSubscription
    await secureConsumer.handleCreateSubscription(
      {
        subscriptionId: 'sub_enc_1',
        remoteIp: '127.0.0.1',
        encryptedCreditCard: 'iv:tag:cipher',
      },
      contextMock,
    );

    expect(cardEncryptionServiceMock.decrypt).toHaveBeenCalledWith('iv:tag:cipher');
    expect(createUseCaseMock.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 'sub_enc_1',
        creditCard: rawCard,
      }),
    );

    // 2. handleUpdateSubscriptionCard
    await secureConsumer.handleUpdateSubscriptionCard(
      {
        subscriptionId: 'sub_enc_1',
        remoteIp: '127.0.0.1',
        encryptedCreditCard: 'iv:tag:cipher',
      },
      contextMock,
    );

    expect(updateCardUseCaseMock.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 'sub_enc_1',
        creditCard: rawCard,
      }),
    );
  });
});

