import { Test, TestingModule } from '@nestjs/testing';
import { ProcessSubaccountTransferUseCase } from '../use-cases/process-subaccount-transfer.use-case';
import { SUBACCOUNT_REPOSITORY_TOKEN } from '../repositories/subaccount.repository.interface';
import { AsaasClientProvider } from '../../../infra/asaas/asaas-client.provider';
import { EVENT_PUBLISHER_TOKEN } from '../../../infra/messaging/contracts/event-publisher.interface';
import { CardEncryptionService } from '../../../infra/security/card-encryption.service';
import { AsaasBadRequestException, AsaasGatewayException } from '../../../infra/asaas/errors';

describe('ProcessSubaccountTransferUseCase', () => {
  let useCase: ProcessSubaccountTransferUseCase;
  let repository: any;
  let asaasClient: any;
  let eventPublisher: any;
  let cardEncryptionService: any;

  beforeEach(async () => {
    repository = {
      findById: jest.fn(),
      findByExternalId: jest.fn(),
    };

    asaasClient = {
      post: jest.fn(),
    };

    eventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    cardEncryptionService = {
      isEncrypted: jest.fn().mockReturnValue(false),
      decryptText: jest.fn((val) => val),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessSubaccountTransferUseCase,
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
        {
          provide: CardEncryptionService,
          useValue: cardEncryptionService,
        },
      ],
    }).compile();

    useCase = module.get<ProcessSubaccountTransferUseCase>(ProcessSubaccountTransferUseCase);
  });

  it('deve realizar transferência via PIX com sucesso utilizando a apiKey da subconta', async () => {
    const subaccount = {
      id: 'subacc_10',
      externalId: 'freelancer_10',
      apiKey: '$aact_subaccount_token_abc',
    };

    repository.findById.mockResolvedValue(subaccount);
    asaasClient.post.mockResolvedValue({
      id: 'transf_123',
      value: 150.0,
      status: 'PENDING',
      dateCreated: '2026-09-30',
    });

    const result = await useCase.execute({
      subaccountId: 'subacc_10',
      transferData: {
        value: 150.0,
        pixAddressKey: 'carlos@email.com',
        pixAddressKeyType: 'EMAIL',
        description: 'Repasse semanal',
      },
    });

    expect(result.id).toBe('transf_123');
    expect(asaasClient.post).toHaveBeenCalledWith(
      '/v3/transfers',
      {
        value: 150.0,
        pixAddressKey: 'carlos@email.com',
        pixAddressKeyType: 'EMAIL',
        description: 'Repasse semanal',
      },
      {
        customApiKey: '$aact_subaccount_token_abc',
      },
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'webhook.forward_to_client',
      expect.objectContaining({
        event: 'TRANSFER_CREATED',
        transfer: expect.objectContaining({
          id: 'transf_123',
          subaccountId: 'subacc_10',
        }),
      }),
    );
  });

  it('deve realizar transferência via TED bancária descriptografando apiKey cifrada', async () => {
    const subaccount = {
      id: 'subacc_20',
      externalId: 'freelancer_20',
      apiKey: 'iv:tag:cipher_encrypted_token',
    };

    repository.findById.mockResolvedValue(null);
    repository.findByExternalId.mockResolvedValue(subaccount);
    cardEncryptionService.isEncrypted.mockReturnValue(true);
    cardEncryptionService.decryptText.mockReturnValue('$aact_decrypted_token_xyz');

    asaasClient.post.mockResolvedValue({
      id: 'transf_456',
      value: 300.0,
      status: 'PENDING',
    });

    await useCase.execute({
      subaccountId: 'freelancer_20',
      transferData: {
        value: 300.0,
        bankAccount: {
          bankCode: '260',
          agency: '0001',
          account: '123456',
          accountDigit: '7',
          bankAccountType: 'CONTA_CORRENTE',
          cpfCnpj: '24971563792',
          name: 'Carlos Silva',
        },
      },
    });

    expect(cardEncryptionService.decryptText).toHaveBeenCalledWith('iv:tag:cipher_encrypted_token');
    expect(asaasClient.post).toHaveBeenCalledWith(
      '/v3/transfers',
      expect.objectContaining({
        value: 300.0,
        bankAccount: expect.objectContaining({
          bank: { code: '260' },
          agency: '0001',
          account: '123456',
        }),
      }),
      {
        customApiKey: '$aact_decrypted_token_xyz',
      },
    );
  });

  it('deve falhar com AsaasBadRequestException se subconta não possuir apiKey', async () => {
    const subaccount = {
      id: 'subacc_no_key',
      externalId: 'freelancer_no_key',
      apiKey: null,
    };

    repository.findById.mockResolvedValue(subaccount);

    await expect(
      useCase.execute({
        subaccountId: 'subacc_no_key',
        transferData: { value: 50.0, pixAddressKey: 'key@pix.com' },
      }),
    ).rejects.toThrow(AsaasBadRequestException);

    expect(asaasClient.post).not.toHaveBeenCalled();
  });

  it('deve falhar se subconta não for encontrada', async () => {
    repository.findById.mockResolvedValue(null);
    repository.findByExternalId.mockResolvedValue(null);

    await expect(
      useCase.execute({
        subaccountId: 'inexistente',
        transferData: { value: 50.0, pixAddressKey: 'key@pix.com' },
      }),
    ).rejects.toThrow(AsaasBadRequestException);

    expect(asaasClient.post).not.toHaveBeenCalled();
  });

  it('deve propagar erro 500 do Asaas para acionar retry no RabbitMQ', async () => {
    const subaccount = {
      id: 'subacc_err',
      externalId: 'freelancer_err',
      apiKey: '$aact_token',
    };

    repository.findById.mockResolvedValue(subaccount);
    asaasClient.post.mockRejectedValue(new AsaasGatewayException('Asaas Gateway Timeout', 504));

    await expect(
      useCase.execute({
        subaccountId: 'subacc_err',
        transferData: { value: 100.0, pixAddressKey: 'key@pix.com' },
      }),
    ).rejects.toThrow(AsaasGatewayException);
  });
});
