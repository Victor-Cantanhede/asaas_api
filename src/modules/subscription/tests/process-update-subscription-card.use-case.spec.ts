import { Test, TestingModule } from '@nestjs/testing';
import { ProcessUpdateSubscriptionCardUseCase } from '../use-cases/process-update-subscription-card.use-case';
import { SUBSCRIPTION_REPOSITORY_TOKEN } from '../repositories/subscription.repository.interface';
import { AsaasClientProvider } from '../../../infra/asaas/asaas-client.provider';
import { EVENT_PUBLISHER_TOKEN } from '../../../infra/messaging/contracts/event-publisher.interface';
import { AsaasBadRequestException, AsaasGatewayException } from '../../../infra/asaas/errors';

describe('ProcessUpdateSubscriptionCardUseCase (Unit & Reliability Specialist)', () => {
  let useCase: ProcessUpdateSubscriptionCardUseCase;
  let subscriptionRepositoryMock: any;
  let asaasClientMock: any;
  let eventPublisherMock: any;

  beforeEach(async () => {
    subscriptionRepositoryMock = {
      findById: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };

    asaasClientMock = {
      put: jest.fn(),
    };

    eventPublisherMock = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessUpdateSubscriptionCardUseCase,
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

    useCase = module.get<ProcessUpdateSubscriptionCardUseCase>(
      ProcessUpdateSubscriptionCardUseCase,
    );
  });

  describe('1. Caminho Feliz (Nominal)', () => {
    it('deve atualizar cartão com creditCardToken, persistir no banco e disparar evento', async () => {
      const subscription = {
        id: 'sub_card_1',
        asaasSubscriptionId: 'sub_asaas_123',
        creditCardToken: 'old_tok',
        creditCardBrand: 'MASTERCARD',
        creditCardLast4: '1111',
      };

      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
      asaasClientMock.put.mockResolvedValue({
        creditCard: {
          creditCardToken: 'new_tok_999',
          creditCardBrand: 'VISA',
          creditCardNumber: '9999',
        },
      });

      const input = {
        subscriptionId: 'sub_card_1',
        remoteIp: '189.10.20.30',
        creditCardToken: 'new_tok_999',
      };

      await useCase.execute(input);

      expect(asaasClientMock.put).toHaveBeenCalledWith(
        '/v3/subscriptions/sub_asaas_123/creditCard',
        {
          remoteIp: '189.10.20.30',
          creditCardToken: 'new_tok_999',
        },
      );

      expect(subscriptionRepositoryMock.update).toHaveBeenCalledWith('sub_card_1', {
        creditCardToken: 'new_tok_999',
        creditCardBrand: 'VISA',
        creditCardLast4: '9999',
        failureReason: null,
      });

      expect(eventPublisherMock.publish).toHaveBeenCalledWith(
        'webhook.forward_to_client',
        {
          event: 'SUBSCRIPTION_CARD_UPDATED',
          subscription: {
            id: 'sub_card_1',
            asaasSubscriptionId: 'sub_asaas_123',
          },
        },
      );
    });

    it('deve atualizar utilizando dados brutos de cartão e creditCardHolderInfo quando fornecidos', async () => {
      const subscription = {
        id: 'sub_card_raw',
        asaasSubscriptionId: 'sub_asaas_raw',
      };

      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
      asaasClientMock.put.mockResolvedValue({
        creditCard: {
          creditCardToken: 'token_generated_by_asaas',
          creditCardBrand: 'ELO',
          creditCardNumber: '5050',
        },
      });

      const rawCard = {
        holderName: 'MARIA SILVA',
        number: '5067220000005050',
        expiryMonth: '12',
        expiryYear: '2029',
        ccv: '123',
      };

      const holderInfo = {
        name: 'MARIA SILVA',
        email: 'maria@example.com',
        cpfCnpj: '12345678909',
        postalCode: '01310100',
        addressNumber: '100',
        phone: '11999998888',
      };

      await useCase.execute({
        subscriptionId: 'sub_card_raw',
        remoteIp: '200.100.50.25',
        creditCard: rawCard,
        creditCardHolderInfo: holderInfo,
      });

      expect(asaasClientMock.put).toHaveBeenCalledWith(
        '/v3/subscriptions/sub_asaas_raw/creditCard',
        {
          remoteIp: '200.100.50.25',
          creditCard: rawCard,
          creditCardHolderInfo: holderInfo,
        },
      );

      expect(subscriptionRepositoryMock.update).toHaveBeenCalledWith('sub_card_raw', {
        creditCardToken: 'token_generated_by_asaas',
        creditCardBrand: 'ELO',
        creditCardLast4: '5050',
        failureReason: null,
      });
    });
  });

  describe('2. Valores Limítrofes e Edge Cases', () => {
    it('deve preservar dados pré-existentes se o retorno do Asaas omitir o nó creditCard', async () => {
      const subscription = {
        id: 'sub_card_fallback',
        asaasSubscriptionId: 'sub_asaas_fb',
        creditCardToken: 'fallback_token',
        creditCardBrand: 'AMEX',
        creditCardLast4: '0005',
      };

      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
      // Asaas retorna sucesso mas sem detalhe de creditCard
      asaasClientMock.put.mockResolvedValue({ success: true });

      await useCase.execute({
        subscriptionId: 'sub_card_fallback',
        remoteIp: '177.10.10.1',
        creditCardToken: 'fallback_token',
      });

      expect(subscriptionRepositoryMock.update).toHaveBeenCalledWith('sub_card_fallback', {
        creditCardToken: 'fallback_token',
        creditCardBrand: 'AMEX',
        creditCardLast4: '0005',
        failureReason: null,
      });
    });

    it('não deve mutar o objeto de input por referência', async () => {
      const subscription = {
        id: 'sub_immut',
        asaasSubscriptionId: 'sub_asaas_immut',
      };
      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
      asaasClientMock.put.mockResolvedValue({});

      const input = Object.freeze({
        subscriptionId: 'sub_immut',
        remoteIp: '127.0.0.1',
        creditCardToken: 'tok_immutable',
      });

      await expect(useCase.execute(input)).resolves.not.toThrow();
      expect(input.remoteIp).toBe('127.0.0.1');
    });
  });

  describe('3. Cenários de Falha e Exceção', () => {
    it('deve abortar sem chamar Asaas quando a assinatura não for encontrada', async () => {
      subscriptionRepositoryMock.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({
          subscriptionId: 'sub_inexistente',
          remoteIp: '10.0.0.1',
        }),
      ).resolves.not.toThrow();

      expect(asaasClientMock.put).not.toHaveBeenCalled();
      expect(subscriptionRepositoryMock.update).not.toHaveBeenCalled();
      expect(eventPublisherMock.publish).not.toHaveBeenCalled();
    });

    it('deve abortar sem chamar Asaas se a assinatura não possuir asaasSubscriptionId', async () => {
      const subscription = {
        id: 'sub_sem_asaas_id',
        asaasSubscriptionId: null,
      };
      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);

      await expect(
        useCase.execute({
          subscriptionId: 'sub_sem_asaas_id',
          remoteIp: '10.0.0.1',
        }),
      ).resolves.not.toThrow();

      expect(asaasClientMock.put).not.toHaveBeenCalled();
      expect(subscriptionRepositoryMock.update).not.toHaveBeenCalled();
      expect(eventPublisherMock.publish).not.toHaveBeenCalled();
    });

    it('deve salvar failureReason e NÃO relançar erro se for AsaasBadRequestException (rejeição de cartão)', async () => {
      const subscription = {
        id: 'sub_recusa_cartao',
        asaasSubscriptionId: 'sub_asaas_recusa',
      };
      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);

      asaasClientMock.put.mockRejectedValue(
        new AsaasBadRequestException('Cartão de crédito não autorizado pelo emissor'),
      );

      await expect(
        useCase.execute({
          subscriptionId: 'sub_recusa_cartao',
          remoteIp: '189.1.1.1',
          creditCardToken: 'tok_declined',
        }),
      ).resolves.not.toThrow();

      expect(subscriptionRepositoryMock.update).toHaveBeenCalledWith('sub_recusa_cartao', {
        failureReason: 'Cartão de crédito não autorizado pelo emissor',
      });
      expect(eventPublisherMock.publish).not.toHaveBeenCalled();
    });

    it('deve salvar failureReason e RELANÇAR erro quando ocorrer falha 5xx / rede para retry', async () => {
      const subscription = {
        id: 'sub_gateway_down',
        asaasSubscriptionId: 'sub_asaas_down',
      };
      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);

      const gatewayError = new AsaasGatewayException('Asaas Gateway Timeout 504', 504);
      asaasClientMock.put.mockRejectedValue(gatewayError);

      await expect(
        useCase.execute({
          subscriptionId: 'sub_gateway_down',
          remoteIp: '189.1.1.1',
          creditCardToken: 'tok_retry',
        }),
      ).rejects.toThrow(AsaasGatewayException);

      expect(subscriptionRepositoryMock.update).toHaveBeenCalledWith('sub_gateway_down', {
        failureReason: 'Asaas Gateway Timeout 504',
      });
    });
  });

  describe('4. Segurança e Integridade das Regras de Negócio', () => {
    it('deve priorizar creditCardToken sobre dados de cartão em caso de envio simultâneo', async () => {
      const subscription = {
        id: 'sub_priority_test',
        asaasSubscriptionId: 'sub_asaas_prio',
      };
      subscriptionRepositoryMock.findById.mockResolvedValue(subscription);
      asaasClientMock.put.mockResolvedValue({});

      await useCase.execute({
        subscriptionId: 'sub_priority_test',
        remoteIp: '189.2.2.2',
        creditCardToken: 'token_prioritario',
        creditCard: {
          holderName: 'IGNORE ME',
          number: '4000000000000001',
          expiryMonth: '10',
          expiryYear: '2030',
          ccv: '999',
        },
      });

      expect(asaasClientMock.put).toHaveBeenCalledWith(
        '/v3/subscriptions/sub_asaas_prio/creditCard',
        {
          remoteIp: '189.2.2.2',
          creditCardToken: 'token_prioritario',
        },
      );
    });
  });
});
