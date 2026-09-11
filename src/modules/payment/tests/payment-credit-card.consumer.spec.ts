import { Test, TestingModule } from '@nestjs/testing';
import { PaymentCreditCardConsumer } from '../consumers/payment-credit-card.consumer';
import { ProcessCreditCardPaymentUseCase } from '../use-cases/process-credit-card-payment.use-case';
import { RmqContext } from '@nestjs/microservices';
import { AsaasGatewayException } from '../../../infra/asaas/errors';

describe('PaymentCreditCardConsumer', () => {
  let consumer: PaymentCreditCardConsumer;
  let processCreditCardUseCaseMock: any;
  let channelMock: any;
  let contextMock: any;

  beforeEach(async () => {
    processCreditCardUseCaseMock = {
      execute: jest.fn().mockResolvedValue(undefined),
    };

    channelMock = {
      ack: jest.fn(),
      nack: jest.fn(),
    };

    contextMock = {
      getChannelRef: jest.fn().mockReturnValue(channelMock),
      getMessage: jest.fn().mockReturnValue({ content: 'msg_cc' }),
    } as unknown as RmqContext;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentCreditCardConsumer],
      providers: [
        {
          provide: ProcessCreditCardPaymentUseCase,
          useValue: processCreditCardUseCaseMock,
        },
      ],
    }).compile();

    consumer = module.get<PaymentCreditCardConsumer>(PaymentCreditCardConsumer);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  it('should process credit card payment and ack message on success', async () => {
    const payload = {
      paymentId: 'pay_cc_1',
      remoteIp: '187.12.34.56',
      creditCardToken: 'tok_123',
    };

    await consumer.handleChargeCreditCard(payload, contextMock);

    expect(processCreditCardUseCaseMock.execute).toHaveBeenCalledWith(payload);
    expect(channelMock.ack).toHaveBeenCalledWith({ content: 'msg_cc' });
    expect(channelMock.nack).not.toHaveBeenCalled();
  });

  it('should requeue message via nack when transient AsaasGatewayException occurs', async () => {
    processCreditCardUseCaseMock.execute.mockRejectedValue(
      new AsaasGatewayException('Asaas gateway 504', 504),
    );

    const payload = {
      paymentId: 'pay_cc_1',
      remoteIp: '187.12.34.56',
      creditCardToken: 'tok_123',
    };

    await consumer.handleChargeCreditCard(payload, contextMock);

    expect(channelMock.nack).toHaveBeenCalledWith({ content: 'msg_cc' }, false, true);
    expect(channelMock.ack).not.toHaveBeenCalled();
  });

  it('should acknowledge message via ack on business error (e.g. card declined) to avoid infinite loop', async () => {
    processCreditCardUseCaseMock.execute.mockRejectedValue(
      new Error('Cartão não autorizado'),
    );

    const payload = {
      paymentId: 'pay_cc_1',
      remoteIp: '187.12.34.56',
      creditCardToken: 'tok_123',
    };

    await consumer.handleChargeCreditCard(payload, contextMock);

    expect(channelMock.ack).toHaveBeenCalledWith({ content: 'msg_cc' });
    expect(channelMock.nack).not.toHaveBeenCalled();
  });

  it('should decrypt encryptedCreditCard when present and delegate decrypted card to use case', async () => {
    const rawCard = {
      holderName: 'BOB SMITH',
      number: '4222222222222222',
      expiryMonth: '11',
      expiryYear: '2030',
      ccv: '888',
    };

    const cardEncryptionServiceMock = {
      decrypt: jest.fn().mockReturnValue(rawCard),
    };

    const secureConsumer = new PaymentCreditCardConsumer(
      processCreditCardUseCaseMock,
      cardEncryptionServiceMock as any,
    );

    const payload = {
      paymentId: 'pay_cc_enc_1',
      remoteIp: '187.12.34.56',
      encryptedCreditCard: 'iv_mock:tag_mock:cipher_mock',
    };

    await secureConsumer.handleChargeCreditCard(payload, contextMock);

    expect(cardEncryptionServiceMock.decrypt).toHaveBeenCalledWith(
      'iv_mock:tag_mock:cipher_mock',
    );
    expect(processCreditCardUseCaseMock.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: 'pay_cc_enc_1',
        creditCard: rawCard,
      }),
    );
    expect(channelMock.ack).toHaveBeenCalledWith({ content: 'msg_cc' });
  });
});

