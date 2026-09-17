import { Test, TestingModule } from '@nestjs/testing';
import { CreateSubaccountUseCase } from '../use-cases/create-subaccount.use-case';
import { SUBACCOUNT_REPOSITORY_TOKEN } from '../repositories/subaccount.repository.interface';
import { AsaasClientProvider } from '../../../infra/asaas/asaas-client.provider';
import { EVENT_PUBLISHER_TOKEN } from '../../../infra/messaging/contracts/event-publisher.interface';
import { AsaasBadRequestException, AsaasGatewayException } from '../../../infra/asaas/errors';

describe('CreateSubaccountUseCase', () => {
  let useCase: CreateSubaccountUseCase;
  let repository: any;
  let asaasClient: any;
  let eventPublisher: any;

  beforeEach(async () => {
    repository = {
      findById: jest.fn().mockResolvedValue({
        id: 'subacc_1',
        externalId: 'ext_1',
        name: 'Carlos Silva',
        email: 'carlos@empresa.com',
        cpfCnpj: '12345678901',
        escrowEnabled: true,
        escrowDaysToExpire: 30,
        status: 'RECEIVED',
      }),
      updateSynced: jest.fn().mockResolvedValue({}),
      updateStatus: jest.fn().mockResolvedValue({}),
    };

    asaasClient = {
      get: jest.fn().mockResolvedValue({ data: [] }),
      post: jest.fn().mockImplementation((path: string) => {
        if (path === '/v3/accounts') {
          return Promise.resolve({
            id: 'acc_asaas_1',
            walletId: 'wal_asaas_1',
          });
        }
        if (path.includes('/escrow')) {
          return Promise.resolve({ enabled: true });
        }
        return Promise.resolve({});
      }),
    };

    eventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateSubaccountUseCase,
        {
          provide: SUBACCOUNT_REPOSITORY_TOKEN,
          useValue: repository,
        },
        {
          provide: AsaasClientProvider,
          useValue: asaasClient,
        },
        {
          provide: EVENT_PUBLISHER_TOKEN,
          useValue: eventPublisher,
        },
      ],
    }).compile();

    useCase = module.get<CreateSubaccountUseCase>(CreateSubaccountUseCase);
  });

  it('deve criar subconta nova, ativar escrow, sincronizar no banco e notificar via evento', async () => {
    await useCase.execute({ subaccountId: 'subacc_1', externalId: 'ext_1' });

    expect(asaasClient.get).toHaveBeenCalledWith('/v3/accounts', {
      cpfCnpj: '12345678901',
    });
    expect(asaasClient.post).toHaveBeenCalledWith(
      '/v3/accounts',
      expect.objectContaining({ name: 'Carlos Silva', email: 'carlos@empresa.com' }),
    );
    expect(asaasClient.post).toHaveBeenCalledWith(
      '/v3/accounts/acc_asaas_1/escrow',
      { enabled: true, daysToExpire: 30 },
    );
    expect(repository.updateSynced).toHaveBeenCalledWith('subacc_1', {
      asaasAccountId: 'acc_asaas_1',
      walletId: 'wal_asaas_1',
      escrowEnabled: true,
      escrowDaysToExpire: 30,
    });
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'webhook.forward_to_client',
      expect.objectContaining({
        event: 'SUBACCOUNT_CREATED',
        subaccount: expect.objectContaining({
          walletId: 'wal_asaas_1',
          externalId: 'ext_1',
        }),
      }),
    );
  });

  it('deve reutilizar subconta existente caso o CPF/CNPJ já esteja cadastrado no Asaas', async () => {
    asaasClient.get.mockResolvedValueOnce({
      data: [{ id: 'acc_existing', walletId: 'wal_existing' }],
    });

    await useCase.execute({ subaccountId: 'subacc_1', externalId: 'ext_1' });

    expect(asaasClient.post).not.toHaveBeenCalledWith('/v3/accounts', expect.anything());
    expect(repository.updateSynced).toHaveBeenCalledWith(
      'subacc_1',
      expect.objectContaining({
        asaasAccountId: 'acc_existing',
        walletId: 'wal_existing',
      }),
    );
  });

  it('deve marcar status FAILED sem rethrow em caso de erro 400 permanente de validação', async () => {
    asaasClient.post.mockRejectedValueOnce(
      new AsaasBadRequestException('CPF inválido', [{ description: 'CPF inválido' }]),
    );

    await useCase.execute({ subaccountId: 'subacc_1', externalId: 'ext_1' });

    expect(repository.updateStatus).toHaveBeenCalledWith(
      'subacc_1',
      'FAILED',
      'CPF inválido',
    );
  });

  it('deve propagar erro de gateway (502) para acionar retry no RabbitMQ', async () => {
    asaasClient.post.mockRejectedValueOnce(
      new AsaasGatewayException('Gateway timeout', 504),
    );

    await expect(
      useCase.execute({ subaccountId: 'subacc_1', externalId: 'ext_1' }),
    ).rejects.toThrow(AsaasGatewayException);

    expect(repository.updateStatus).toHaveBeenCalledWith(
      'subacc_1',
      'FAILED',
      expect.any(String),
    );
  });
});
