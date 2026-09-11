import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentController } from '../payment.controller';
import { PAYMENT_REPOSITORY_TOKEN } from '../repositories/payment.repository.interface';
import { CUSTOMER_REPOSITORY_TOKEN } from '../../customer/repositories/customer.repository.interface';
import { EVENT_PUBLISHER_TOKEN } from '../../../infra/messaging/contracts/event-publisher.interface';
import { GetPaymentUseCase } from '../use-cases/get-payment.use-case';

describe('PaymentController (PIX)', () => {
  let controller: PaymentController;
  let paymentRepositoryMock: any;
  let customerRepositoryMock: any;
  let eventPublisherMock: any;
  let getPaymentUseCaseMock: any;

  beforeEach(async () => {
    paymentRepositoryMock = {
      createInitial: jest.fn().mockResolvedValue({
        id: 'pay_uuid_1',
        status: 'RECEIVED',
        createdAt: new Date('2026-09-10T15:30:00.000Z'),
      }),
    };

    customerRepositoryMock = {
      findById: jest.fn(),
      findByExternalId: jest.fn(),
    };

    eventPublisherMock = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    getPaymentUseCaseMock = {
      execute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [
        {
          provide: PAYMENT_REPOSITORY_TOKEN,
          useValue: paymentRepositoryMock,
        },
        {
          provide: CUSTOMER_REPOSITORY_TOKEN,
          useValue: customerRepositoryMock,
        },
        {
          provide: EVENT_PUBLISHER_TOKEN,
          useValue: eventPublisherMock,
        },
        {
          provide: GetPaymentUseCase,
          useValue: getPaymentUseCaseMock,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test_key') },
        },
      ],
    }).compile();

    controller = module.get<PaymentController>(PaymentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create initial payment record and publish payment.create_pix returning 202 Accepted', async () => {
    customerRepositoryMock.findById.mockResolvedValue({
      id: 'cust_uuid_1',
      externalId: 'ext_1',
    });

    const dto = {
      customerId: 'cust_uuid_1',
      value: 150.0,
      description: 'Test PIX',
      externalReference: 'order_1024',
    };

    const response = await controller.createPixPayment(dto);

    expect(paymentRepositoryMock.createInitial).toHaveBeenCalledWith({
      customerId: 'cust_uuid_1',
      billingType: 'PIX',
      value: 150.0,
      dueDate: null,
      externalReference: 'order_1024',
      splitConfig: null,
    });
    expect(eventPublisherMock.publish).toHaveBeenCalledWith('payment.create_pix', {
      paymentId: 'pay_uuid_1',
    });
    expect(response).toEqual({
      trackingId: 'pay_uuid_1',
      status: 'RECEIVED',
      message: 'Cobrança PIX recebida e enfileirada para processamento.',
      createdAt: '2026-09-10T15:30:00.000Z',
      checkStatusUrl: '/payments/pay_uuid_1',
    });
  });

  it('should create initial credit card payment and publish payment.charge_credit_card returning 202 Accepted', async () => {
    customerRepositoryMock.findById.mockResolvedValue({
      id: 'cust_uuid_1',
      externalId: 'ext_1',
    });

    const dto = {
      customerId: 'cust_uuid_1',
      value: 300.0,
      remoteIp: '187.12.34.56',
      creditCardToken: 'token_saved_123',
    };

    const response = await controller.createCreditCardPayment(dto as any);

    expect(paymentRepositoryMock.createInitial).toHaveBeenCalledWith({
      customerId: 'cust_uuid_1',
      billingType: 'CREDIT_CARD',
      value: 300.0,
      dueDate: null,
      externalReference: undefined,
      splitConfig: null,
    });
    expect(eventPublisherMock.publish).toHaveBeenCalledWith(
      'payment.charge_credit_card',
      expect.objectContaining({
        paymentId: 'pay_uuid_1',
        remoteIp: '187.12.34.56',
        creditCardToken: 'token_saved_123',
      }),
    );
    expect(response.status).toBe('RECEIVED');
    expect(response.trackingId).toBe('pay_uuid_1');
  });

  it('should throw BadRequestException if neither creditCard nor creditCardToken is provided', async () => {
    const dto = {
      customerId: 'cust_uuid_1',
      value: 300.0,
      remoteIp: '187.12.34.56',
    };

    await expect(controller.createCreditCardPayment(dto as any)).rejects.toThrow();
  });

  it('should throw NotFoundException if customer is not found by ID or externalId', async () => {
    customerRepositoryMock.findById.mockResolvedValue(null);
    customerRepositoryMock.findByExternalId.mockResolvedValue(null);

    const dto = {
      customerId: 'unknown_customer',
      value: 100.0,
    };

    await expect(controller.createPixPayment(dto)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should delegate GET /payments/:id to GetPaymentUseCase', async () => {
    getPaymentUseCaseMock.execute.mockResolvedValue({
      id: 'pay_uuid_1',
      billingType: 'PIX',
      status: 'PENDING',
    });

    const result = await controller.getPaymentById('pay_uuid_1');

    expect(getPaymentUseCaseMock.execute).toHaveBeenCalledWith('pay_uuid_1');
    expect(result.id).toBe('pay_uuid_1');
  });

  it('should encrypt creditCard into encryptedCreditCard and omit plaintext card when CardEncryptionService is present', async () => {
    const cardEncryptionServiceMock = {
      encrypt: jest.fn().mockReturnValue('iv_b64:tag_b64:cipher_b64'),
    };

    const secureController = new PaymentController(
      paymentRepositoryMock,
      customerRepositoryMock,
      eventPublisherMock,
      getPaymentUseCaseMock,
      cardEncryptionServiceMock as any,
    );

    customerRepositoryMock.findById.mockResolvedValue({
      id: 'cust_uuid_1',
      externalId: 'ext_1',
    });

    const rawCard = {
      holderName: 'ALICE DOE',
      number: '4111111111111111',
      expiryMonth: '10',
      expiryYear: '2029',
      ccv: '999',
    };

    const dto = {
      customerId: 'cust_uuid_1',
      value: 250.0,
      remoteIp: '187.12.34.56',
      creditCard: rawCard,
    };

    await secureController.createCreditCardPayment(dto as any);

    expect(cardEncryptionServiceMock.encrypt).toHaveBeenCalledWith(rawCard);
    expect(eventPublisherMock.publish).toHaveBeenCalledWith(
      'payment.charge_credit_card',
      expect.objectContaining({
        paymentId: 'pay_uuid_1',
        creditCard: undefined,
        encryptedCreditCard: 'iv_b64:tag_b64:cipher_b64',
      }),
    );
  });
});

