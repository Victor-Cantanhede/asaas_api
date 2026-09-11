import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GetPaymentUseCase } from '../use-cases/get-payment.use-case';
import { PAYMENT_REPOSITORY_TOKEN } from '../repositories/payment.repository.interface';

describe('GetPaymentUseCase', () => {
  let useCase: GetPaymentUseCase;
  let repositoryMock: any;

  beforeEach(async () => {
    repositoryMock = {
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetPaymentUseCase,
        {
          provide: PAYMENT_REPOSITORY_TOKEN,
          useValue: repositoryMock,
        },
      ],
    }).compile();

    useCase = module.get<GetPaymentUseCase>(GetPaymentUseCase);
  });

  it('should return mapped payment details when payment exists', async () => {
    const payment = {
      id: 'pay_123',
      customerId: 'cust_123',
      asaasPaymentId: 'pay_asaas_123',
      billingType: 'PIX',
      status: 'PENDING',
      value: 150.0,
      netValue: 148.01,
      dueDate: new Date('2026-09-15T00:00:00.000Z'),
      paymentDate: null,
      invoiceUrl: 'https://sandbox.asaas.com/i/123',
      externalReference: 'order_1024',
      pixQrCodeBase64: 'base64_str',
      pixPayload: 'pix_code_str',
      pixExpirationDate: new Date('2026-09-15T23:59:59.000Z'),
      failureReason: null,
      createdAt: new Date('2026-09-10T15:30:00.000Z'),
      updatedAt: new Date('2026-09-10T15:30:02.000Z'),
    };

    repositoryMock.findById.mockResolvedValue(payment);

    const result = await useCase.execute('pay_123');

    expect(repositoryMock.findById).toHaveBeenCalledWith('pay_123');
    expect(result).toEqual(payment);
  });

  it('should throw NotFoundException when payment does not exist', async () => {
    repositoryMock.findById.mockResolvedValue(null);

    await expect(useCase.execute('non_existent')).rejects.toThrow(
      NotFoundException,
    );
  });
});
