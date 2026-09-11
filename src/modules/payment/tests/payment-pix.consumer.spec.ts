import { Test, TestingModule } from '@nestjs/testing';
import { PaymentPixConsumer } from '../consumers/payment-pix.consumer';
import { ProcessPixPaymentUseCase } from '../use-cases/process-pix-payment.use-case';
import { RmqContext } from '@nestjs/microservices';
import { AsaasGatewayException } from '../../../infra/asaas/errors';

describe('PaymentPixConsumer', () => {
  let consumer: PaymentPixConsumer;
  let processPixUseCaseMock: any;
  let channelMock: any;
  let contextMock: any;

  beforeEach(async () => {
    processPixUseCaseMock = {
      execute: jest.fn().mockResolvedValue(undefined),
    };

    channelMock = {
      ack: jest.fn(),
      nack: jest.fn(),
    };

    contextMock = {
      getChannelRef: jest.fn().mockReturnValue(channelMock),
      getMessage: jest.fn().mockReturnValue({ content: 'msg_pix' }),
    } as unknown as RmqContext;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentPixConsumer],
      providers: [
        {
          provide: ProcessPixPaymentUseCase,
          useValue: processPixUseCaseMock,
        },
      ],
    }).compile();

    consumer = module.get<PaymentPixConsumer>(PaymentPixConsumer);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  it('should process payment and ack message on success', async () => {
    const payload = { paymentId: 'pay_123' };

    await consumer.handleCreatePix(payload, contextMock);

    expect(processPixUseCaseMock.execute).toHaveBeenCalledWith(payload);
    expect(channelMock.ack).toHaveBeenCalledWith({ content: 'msg_pix' });
    expect(channelMock.nack).not.toHaveBeenCalled();
  });

  it('should requeue message via nack when transient AsaasGatewayException occurs', async () => {
    processPixUseCaseMock.execute.mockRejectedValue(
      new AsaasGatewayException('Asaas gateway 502', 502),
    );

    const payload = { paymentId: 'pay_123' };

    await consumer.handleCreatePix(payload, contextMock);

    expect(channelMock.nack).toHaveBeenCalledWith({ content: 'msg_pix' }, false, true);
    expect(channelMock.ack).not.toHaveBeenCalled();
  });

  it('should acknowledge message via ack on business error to avoid queue stall', async () => {
    processPixUseCaseMock.execute.mockRejectedValue(new Error('Non-retryable error'));

    const payload = { paymentId: 'pay_123' };

    await consumer.handleCreatePix(payload, contextMock);

    expect(channelMock.ack).toHaveBeenCalledWith({ content: 'msg_pix' });
    expect(channelMock.nack).not.toHaveBeenCalled();
  });
});
