import { Test, TestingModule } from '@nestjs/testing';
import { GetSubaccountByExternalIdUseCase } from '../use-cases/get-subaccount-by-external-id.use-case';
import { SUBACCOUNT_REPOSITORY_TOKEN } from '../repositories/subaccount.repository.interface';
import { NotFoundException } from '@nestjs/common';

describe('GetSubaccountByExternalIdUseCase', () => {
  let useCase: GetSubaccountByExternalIdUseCase;
  let repository: any;

  beforeEach(async () => {
    repository = {
      findByExternalId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetSubaccountByExternalIdUseCase,
        {
          provide: SUBACCOUNT_REPOSITORY_TOKEN,
          useValue: repository,
        },
      ],
    }).compile();

    useCase = module.get<GetSubaccountByExternalIdUseCase>(
      GetSubaccountByExternalIdUseCase,
    );
  });

  it('deve retornar DTO quando a subconta existir', async () => {
    repository.findByExternalId.mockResolvedValueOnce({
      id: 'sub_123',
      externalId: 'ext_1',
      asaasAccountId: 'acc_1',
      walletId: 'wal_1',
      name: 'João',
      email: 'joao@test.com',
      cpfCnpj: '123',
      escrowEnabled: true,
      escrowDaysToExpire: 30,
      status: 'SYNCED',
      failureReason: null,
      createdAt: new Date('2026-09-17T12:00:00.000Z'),
      updatedAt: new Date('2026-09-17T12:00:00.000Z'),
    });

    const result = await useCase.execute('ext_1');

    expect(result.externalId).toBe('ext_1');
    expect(result.walletId).toBe('wal_1');
    expect(result.escrowEnabled).toBe(true);
  });

  it('deve lançar NotFoundException quando a subconta não for encontrada', async () => {
    repository.findByExternalId.mockResolvedValueOnce(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(
      NotFoundException,
    );
  });
});
