import { Test, TestingModule } from '@nestjs/testing';
import { SubaccountController } from '../subaccount.controller';
import { SUBACCOUNT_REPOSITORY_TOKEN } from '../repositories/subaccount.repository.interface';
import { EVENT_PUBLISHER_TOKEN } from '../../../infra/messaging/contracts/event-publisher.interface';
import { GetSubaccountByExternalIdUseCase } from '../use-cases/get-subaccount-by-external-id.use-case';
import { ConfigService } from '@nestjs/config';

describe('SubaccountController', () => {
  let controller: SubaccountController;
  let repository: any;
  let eventPublisher: any;
  let getSubaccountUseCase: any;

  beforeEach(async () => {
    repository = {
      upsertInitial: jest.fn().mockResolvedValue({
        id: 'subacc_123',
        externalId: 'freelancer_1',
        status: 'RECEIVED',
        createdAt: new Date('2026-09-17T12:00:00.000Z'),
      }),
    };

    eventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    getSubaccountUseCase = {
      execute: jest.fn().mockResolvedValue({
        id: 'subacc_123',
        externalId: 'freelancer_1',
        walletId: 'wal_abc',
        status: 'SYNCED',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubaccountController],
      providers: [
        {
          provide: SUBACCOUNT_REPOSITORY_TOKEN,
          useValue: repository,
        },
        {
          provide: EVENT_PUBLISHER_TOKEN,
          useValue: eventPublisher,
        },
        {
          provide: GetSubaccountByExternalIdUseCase,
          useValue: getSubaccountUseCase,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('mock_api_key'),
          },
        },
      ],
    }).compile();

    controller = module.get<SubaccountController>(SubaccountController);
  });

  describe('POST /subaccounts', () => {
    it('deve persistir intenção inicial, emitir subaccount.create e retornar 202 Accepted', async () => {
      const dto = {
        externalId: 'freelancer_1',
        name: 'João Desenvolvedor',
        email: 'joao@dev.com',
        cpfCnpj: '24971563792',
        escrow: { enabled: true, daysToExpire: 30 },
      };

      const result = await controller.createSubaccount(dto);

      expect(repository.upsertInitial).toHaveBeenCalledWith(dto);
      expect(eventPublisher.publish).toHaveBeenCalledWith('subaccount.create', {
        subaccountId: 'subacc_123',
        externalId: 'freelancer_1',
      });
      expect(result).toEqual({
        trackingId: 'subacc_123',
        status: 'RECEIVED',
        message: 'Solicitação de criação de subconta enfileirada com sucesso.',
        createdAt: '2026-09-17T12:00:00.000Z',
        checkStatusUrl: '/subaccounts/freelancer_1',
      });
    });
  });

  describe('GET /subaccounts/:externalId', () => {
    it('deve retornar a subconta consultando o caso de uso síncrono', async () => {
      const result = await controller.getByExternalId('freelancer_1');

      expect(getSubaccountUseCase.execute).toHaveBeenCalledWith('freelancer_1');
      expect(result.walletId).toBe('wal_abc');
    });
  });
});
