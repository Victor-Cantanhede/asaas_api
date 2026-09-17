import { Test, TestingModule } from '@nestjs/testing';
import { ProcessCancelSubscriptionUseCase } from '../use-cases/process-cancel-subscription.use-case';
import { SUBSCRIPTION_REPOSITORY_TOKEN } from '../repositories/subscription.repository.interface';
import { AsaasClientProvider } from '../../../infra/asaas/asaas-client.provider';
import { EVENT_PUBLISHER_TOKEN } from '../../../infra/messaging/contracts/event-publisher.interface';
import { AsaasBadRequestException, AsaasGatewayException } from '../../../infra/asaas/errors';

describe('ProcessCancelSubscriptionUseCase (Unit & Reliability Specialist)', () => {
  let useCase: ProcessCancelSubscriptionUseCase;
  let subscriptionRepositoryMock: any;
  let asaasClientMock: any;
  let eventPublisherMock: any;

  beforeEach(async () => {
    subscriptionRepositoryMock = {
      findById: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    };

    asaasClientMock = {
      delete: jest.fn().mockResolvedValue({ deleted: true }),
    };

    eventPublisherMock = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessCancelSubscriptionUseCase,
        {
          provide: SUBSCRIPTION_REPOSITORY_TOKEN,
          useValue: subscriptionRepositoryMock,
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

    useCase = module.get<ProcessCancelSubscriptionUseCase>(
      ProcessCancelSubscriptionUseCase,
    );
  });

  describe('1. Caminho Feliz (Nominal)', () => {
    it('deve cancelar assinatura no Asaas, atualizar status local para INACTIVE e publicar evento', async () => {
      const subscription = {
        id: 'sub_123',
        asaasSubscriptionId: 'sub_asaas_123',
        status: 'ACTIVE',
      };

      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);

      await useCase.execute({ subscriptionId: 'sub_123' });

      expect(subscriptionRepositoryMock.findById).toHaveBeenCalledWith('sub_123');
      expect(asaasClientMock.delete).toHaveBeenCalledWith('/v3/subscriptions/sub_asaas_123');
      expect(subscriptionRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'sub_123',
        'INACTIVE',
        null,
      );
      expect(eventPublisherMock.publish).toHaveBeenCalledWith(
        'webhook.forward_to_client',
        {
          event: 'SUBSCRIPTION_INACTIVATED',
          subscription: {
            id: 'sub_123',
            asaasSubscriptionId: 'sub_asaas_123',
            status: 'INACTIVE',
          },
        },
      );
    });
  });

  describe('2. Valores Limítrofes e Edge Cases', () => {
    it('deve cancelar localmente sem chamar Asaas quando subscription não possuir asaasSubscriptionId', async () => {
      const subscription = {
        id: 'sub_no_asaas_id',
        asaasSubscriptionId: null,
        status: 'PENDING',
      };

      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);

      await useCase.execute({ subscriptionId: 'sub_no_asaas_id' });

      expect(asaasClientMock.delete).not.toHaveBeenCalled();
      expect(subscriptionRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'sub_no_asaas_id',
        'INACTIVE',
        null,
      );
      expect(eventPublisherMock.publish).toHaveBeenCalledWith(
        'webhook.forward_to_client',
        {
          event: 'SUBSCRIPTION_INACTIVATED',
          subscription: {
            id: 'sub_no_asaas_id',
            asaasSubscriptionId: null,
            status: 'INACTIVE',
          },
        },
      );
    });

    it('não deve mutar o objeto de input passado por referência', async () => {
      const subscription = {
        id: 'sub_immutable_check',
        asaasSubscriptionId: 'sub_asaas_999',
        status: 'ACTIVE',
      };

      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);

      const input = Object.freeze({ subscriptionId: 'sub_immutable_check' });

      await expect(useCase.execute(input)).resolves.not.toThrow();
      expect(input.subscriptionId).toBe('sub_immutable_check');
    });
  });

  describe('3. Cenários de Falha e Exceção', () => {
    it('deve abortar precocemente de forma segura se a assinatura não for encontrada no banco', async () => {
      subscriptionRepositoryMock.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({ subscriptionId: 'sub_inexistente' }),
      ).resolves.not.toThrow();

      expect(asaasClientMock.delete).not.toHaveBeenCalled();
      expect(subscriptionRepositoryMock.updateStatus).not.toHaveBeenCalled();
      expect(subscriptionRepositoryMock.update).not.toHaveBeenCalled();
      expect(eventPublisherMock.publish).not.toHaveBeenCalled();
    });

    it('deve capturar AsaasBadRequestException, registrar motivo de falha e NÃO relançar o erro', async () => {
      const subscription = {
        id: 'sub_bad_request',
        asaasSubscriptionId: 'sub_asaas_invalid',
        status: 'ACTIVE',
      };

      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
      asaasClientMock.delete.mockRejectedValue(
        new AsaasBadRequestException('Assinatura já se encontra cancelada'),
      );

      await expect(
        useCase.execute({ subscriptionId: 'sub_bad_request' }),
      ).resolves.not.toThrow();

      expect(subscriptionRepositoryMock.update).toHaveBeenCalledWith(
        'sub_bad_request',
        { failureReason: 'Assinatura já se encontra cancelada' },
      );
      expect(subscriptionRepositoryMock.updateStatus).not.toHaveBeenCalledWith(
        'sub_bad_request',
        'INACTIVE',
        null,
      );
      expect(eventPublisherMock.publish).not.toHaveBeenCalled();
    });

    it('deve capturar falha de rede/5xx (AsaasGatewayException), persistir falha e RELANÇAR para retentativa no broker', async () => {
      const subscription = {
        id: 'sub_500_error',
        asaasSubscriptionId: 'sub_asaas_down',
        status: 'ACTIVE',
      };

      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
      const networkError = new AsaasGatewayException('Asaas Gateway 503 Unavailable', 503);
      asaasClientMock.delete.mockRejectedValue(networkError);

      await expect(
        useCase.execute({ subscriptionId: 'sub_500_error' }),
      ).rejects.toThrow(AsaasGatewayException);

      expect(subscriptionRepositoryMock.update).toHaveBeenCalledWith(
        'sub_500_error',
        { failureReason: 'Asaas Gateway 503 Unavailable' },
      );
    });

    it('deve relançar erro genérico de infraestrutura mantendo integridade', async () => {
      const subscription = {
        id: 'sub_generic_err',
        asaasSubscriptionId: 'sub_asaas_err',
        status: 'ACTIVE',
      };

      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
      const connectionError = new Error('ECONNRESET socket hang up');
      asaasClientMock.delete.mockRejectedValue(connectionError);

      await expect(
        useCase.execute({ subscriptionId: 'sub_generic_err' }),
      ).rejects.toThrow('ECONNRESET socket hang up');

      expect(subscriptionRepositoryMock.update).toHaveBeenCalledWith(
        'sub_generic_err',
        { failureReason: 'ECONNRESET socket hang up' },
      );
    });
  });

  describe('4. Segurança e Integridade das Regras de Negócio', () => {
    it('deve isolar chamadas e não atualizar assinatura errada quando IDs divergirem', async () => {
      const subscription = {
        id: 'sub_correct_id',
        asaasSubscriptionId: 'sub_asaas_correct',
        status: 'ACTIVE',
      };

      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);

      await useCase.execute({ subscriptionId: 'sub_correct_id' });

      expect(subscriptionRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'sub_correct_id',
        'INACTIVE',
        null,
      );
      expect(subscriptionRepositoryMock.updateStatus).not.toHaveBeenCalledWith(
        'sub_wrong_id',
        expect.anything(),
        expect.anything(),
      );
    });
  });
});
