import { Test, TestingModule } from '@nestjs/testing';
import { PaymentEscrowConsumer } from '../consumers/payment-escrow.consumer';
import { ProcessReleaseEscrowUseCase } from '../use-cases/process-release-escrow.use-case';
import { RmqContext } from '@nestjs/microservices';
import { AsaasGatewayException } from '../../../infra/asaas/errors';

describe('PaymentEscrowConsumer', () => {
  let consumer: PaymentEscrowConsumer;
  let processReleaseEscrowUseCaseMock: any;
  let channelMock: any;
  let contextMock: any;

  beforeEach(async () => {
    processReleaseEscrowUseCaseMock = {
      execute: jest.fn().mockResolvedValue(undefined),
    };

    channelMock = {
      ack: jest.fn(),
      nack: jest.fn(),
    };

    contextMock = {
      getChannelRef: jest.fn().mockReturnValue(channelMock),
      getMessage: jest.fn().mockReturnValue({ content: 'msg_escrow' }),
    } as unknown as RmqContext;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentEscrowConsumer],
      providers: [
        {
          provide: ProcessReleaseEscrowUseCase,
          useValue: processReleaseEscrowUseCaseMock,
        },
      ],
    }).compile();

    consumer = module.get<PaymentEscrowConsumer>(PaymentEscrowConsumer);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  it('should process release escrow and ack message on success', async () => {
    const payload = { paymentId: 'pay_escrow_123' };

    await consumer.handleReleaseEscrow(payload, contextMock);

    expect(processReleaseEscrowUseCaseMock.execute).toHaveBeenCalledWith(payload);
    expect(channelMock.ack).toHaveBeenCalledWith({ content: 'msg_escrow' });
    expect(channelMock.nack).not.toHaveBeenCalled();
  });

  it('should requeue message via nack when transient AsaasGatewayException occurs (>= 500)', async () => {
    processReleaseEscrowUseCaseMock.execute.mockRejectedValue(
      new AsaasGatewayException('Asaas gateway 503 Service Unavailable', 503),
    );

    const payload = { paymentId: 'pay_escrow_123' };

    await consumer.handleReleaseEscrow(payload, contextMock);

    expect(channelMock.nack).toHaveBeenCalledWith({ content: 'msg_escrow' }, false, true);
    expect(channelMock.ack).not.toHaveBeenCalled();
  });

  it('should acknowledge message via ack on business error to avoid queue stall', async () => {
    processReleaseEscrowUseCaseMock.execute.mockRejectedValue(new Error('Business validation error'));

    const payload = { paymentId: 'pay_escrow_123' };

    await consumer.handleReleaseEscrow(payload, contextMock);

    expect(channelMock.ack).toHaveBeenCalledWith({ content: 'msg_escrow' });
    expect(channelMock.nack).not.toHaveBeenCalled();
  });
});
