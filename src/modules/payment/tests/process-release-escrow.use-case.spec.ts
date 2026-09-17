import { Test, TestingModule } from '@nestjs/testing';
import {
  ProcessReleaseEscrowUseCase,
  ProcessReleaseEscrowInput,
} from '../use-cases/process-release-escrow.use-case';
import { PAYMENT_REPOSITORY_TOKEN } from '../repositories/payment.repository.interface';
import { AsaasClientProvider } from '../../../infra/asaas/asaas-client.provider';
import { EVENT_PUBLISHER_TOKEN } from '../../../infra/messaging/contracts/event-publisher.interface';
import { AsaasBadRequestException, AsaasGatewayException } from '../../../infra/asaas/errors';

describe('ProcessReleaseEscrowUseCase', () => {
  let useCase: ProcessReleaseEscrowUseCase;
  let paymentRepositoryMock: any;
  let asaasClientMock: any;
  let eventPublisherMock: any;

  beforeEach(async () => {
    paymentRepositoryMock = {
      findById: jest.fn(),
      findByExternalReference: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };

    asaasClientMock = {
      get: jest.fn().mockResolvedValue(null),
      post: jest.fn(),
    };

    eventPublisherMock = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessReleaseEscrowUseCase,
        {
          provide: PAYMENT_REPOSITORY_TOKEN,
          useValue: paymentRepositoryMock,
        },
        {
          provide: AsaasClientProvider,
          useValue: asaasClientMock,
        },
        {
          provide: EVENT_PUBLISHER_TOKEN,
          useValue: eventPublisherMock,
        },
      ],
    }).compile();

    useCase = module.get<ProcessReleaseEscrowUseCase>(ProcessReleaseEscrowUseCase);
  });

  it('should be defined', () => {
    expect(useCase).toBeDefined();
  });

  it('should release escrow successfully by local UUID and publish client notification', async () => {
    const payment = {
      id: 'pay_uuid_1',
      externalReference: 'order_ref_100',
      asaasPaymentId: 'pay_asaas_123',
      escrowStatus: 'ACTIVE',
    };

    paymentRepositoryMock.findById.mockResolvedValue(payment);
    const finishDateStr = '2026-09-17T18:00:00.000Z';
    asaasClientMock.post.mockResolvedValue({
      finishDate: finishDateStr,
    });

    const input: ProcessReleaseEscrowInput = { paymentId: 'pay_uuid_1' };
    await useCase.execute(input);

    expect(paymentRepositoryMock.findById).toHaveBeenCalledWith('pay_uuid_1');
    expect(asaasClientMock.post).toHaveBeenCalledWith('/v3/payments/pay_asaas_123/escrow', {});
    expect(paymentRepositoryMock.update).toHaveBeenCalledWith('pay_uuid_1', {
      escrowStatus: 'FINISHED',
      escrowFinishDate: new Date(finishDateStr),
    });
    expect(eventPublisherMock.publish).toHaveBeenCalledWith('webhook.forward_to_client', {
      event: 'ESCROW_RELEASED',
      payment: {
        id: 'pay_uuid_1',
        externalReference: 'order_ref_100',
        asaasPaymentId: 'pay_asaas_123',
        escrowStatus: 'FINISHED',
        finishDate: new Date(finishDateStr).toISOString(),
      },
    });
  });

  it('should query GET /v3/payments/:id/escrow and call POST /v3/escrow/:escrowId/finish when guarantee exists', async () => {
    const payment = {
      id: 'pay_uuid_escrow_official',
      externalReference: 'order_official',
      asaasPaymentId: 'pay_asaas_official',
      escrowStatus: 'ACTIVE',
    };

    paymentRepositoryMock.findById.mockResolvedValue(payment);
    asaasClientMock.get.mockResolvedValue({
      id: 'esc_official_999',
      status: 'ACTIVE',
      expirationDate: '2026-10-15',
    });
    const finishDateStr = '2026-09-17T18:30:00.000Z';
    asaasClientMock.post.mockResolvedValue({
      finishDate: finishDateStr,
    });

    await useCase.execute({ paymentId: 'pay_uuid_escrow_official' });

    expect(asaasClientMock.get).toHaveBeenCalledWith('/v3/payments/pay_asaas_official/escrow');
    expect(asaasClientMock.post).toHaveBeenCalledWith('/v3/escrow/esc_official_999/finish', {});
    expect(paymentRepositoryMock.update).toHaveBeenCalledWith('pay_uuid_escrow_official', {
      escrowStatus: 'FINISHED',
      escrowFinishDate: new Date(finishDateStr),
    });
  });

  it('should release escrow polymorphic lookup by externalReference when findById returns null', async () => {
    const payment = {
      id: 'pay_uuid_2',
      externalReference: 'ext_order_200',
      asaasPaymentId: 'pay_asaas_456',
      escrowStatus: 'ACTIVE',
    };

    paymentRepositoryMock.findById.mockResolvedValue(null);
    paymentRepositoryMock.findByExternalReference.mockResolvedValue(payment);
    asaasClientMock.post.mockResolvedValue({});

    await useCase.execute({ paymentId: 'ext_order_200' });

    expect(paymentRepositoryMock.findById).toHaveBeenCalledWith('ext_order_200');
    expect(paymentRepositoryMock.findByExternalReference).toHaveBeenCalledWith('ext_order_200');
    expect(asaasClientMock.post).toHaveBeenCalledWith('/v3/payments/pay_asaas_456/escrow', {});
    expect(paymentRepositoryMock.update).toHaveBeenCalledWith(
      'pay_uuid_2',
      expect.objectContaining({
        escrowStatus: 'FINISHED',
      }),
    );
  });

  it('should log warning and exit gracefully if payment is not found', async () => {
    paymentRepositoryMock.findById.mockResolvedValue(null);
    paymentRepositoryMock.findByExternalReference.mockResolvedValue(null);

    await useCase.execute({ paymentId: 'non_existent_pay' });

    expect(asaasClientMock.post).not.toHaveBeenCalled();
    expect(paymentRepositoryMock.update).not.toHaveBeenCalled();
    expect(eventPublisherMock.publish).not.toHaveBeenCalled();
  });

  it('should log error and exit gracefully if payment has no asaasPaymentId', async () => {
    paymentRepositoryMock.findById.mockResolvedValue({
      id: 'pay_uuid_no_asaas',
      asaasPaymentId: null,
    });

    await useCase.execute({ paymentId: 'pay_uuid_no_asaas' });

    expect(asaasClientMock.post).not.toHaveBeenCalled();
    expect(paymentRepositoryMock.update).not.toHaveBeenCalled();
    expect(eventPublisherMock.publish).not.toHaveBeenCalled();
  });

  it('should not rethrow on AsaasBadRequestException (e.g. escrow already finished or expired)', async () => {
    paymentRepositoryMock.findById.mockResolvedValue({
      id: 'pay_uuid_already_done',
      asaasPaymentId: 'pay_asaas_789',
    });

    asaasClientMock.post.mockRejectedValue(
      new AsaasBadRequestException('A garantia desta cobrança já foi encerrada anteriormente.'),
    );

    await expect(
      useCase.execute({ paymentId: 'pay_uuid_already_done' }),
    ).resolves.not.toThrow();

    expect(paymentRepositoryMock.update).not.toHaveBeenCalled();
  });

  it('should rethrow on transient infrastructure/gateway errors (AsaasGatewayException)', async () => {
    paymentRepositoryMock.findById.mockResolvedValue({
      id: 'pay_uuid_gateway_error',
      asaasPaymentId: 'pay_asaas_999',
    });

    asaasClientMock.post.mockRejectedValue(new AsaasGatewayException('Connection Timeout', 504));

    await expect(
      useCase.execute({ paymentId: 'pay_uuid_gateway_error' }),
    ).rejects.toThrow(AsaasGatewayException);
  });
});
