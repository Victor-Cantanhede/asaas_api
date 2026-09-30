import { Test, TestingModule } from '@nestjs/testing';
import { SubaccountTransferConsumer } from '../consumers/subaccount-transfer.consumer';
import { ProcessSubaccountTransferUseCase } from '../use-cases/process-subaccount-transfer.use-case';
import { RmqContext } from '@nestjs/microservices';
import { AsaasGatewayException } from '../../../infra/asaas/errors';

describe('SubaccountTransferConsumer', () => {
  let consumer: SubaccountTransferConsumer;
  let useCase: any;
  let mockChannel: any;
  let mockMsg: any;
  let mockContext: RmqContext;

  beforeEach(async () => {
    useCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    };

    mockChannel = {
      ack: jest.fn(),
      nack: jest.fn(),
    };
    mockMsg = { content: Buffer.from('{}') };

    mockContext = {
      getChannelRef: () => mockChannel,
      getMessage: () => mockMsg,
    } as unknown as RmqContext;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubaccountTransferConsumer],
      providers: [
        {
          provide: ProcessSubaccountTransferUseCase,
          useValue: useCase,
        },
      ],
    }).compile();

    consumer = module.get<SubaccountTransferConsumer>(SubaccountTransferConsumer);
  });

  it('deve processar transferência com sucesso e confirmar com ack no canal', async () => {
    const input = {
      subaccountId: 'subacc_1',
      transferData: { value: 100.0, pixAddressKey: 'user@pix.com' },
    };

    await consumer.handleSubaccountTransfer(input, mockContext);

    expect(useCase.execute).toHaveBeenCalledWith(input);
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    expect(mockChannel.nack).not.toHaveBeenCalled();
  });

  it('deve efetuar nack(requeue) em caso de falha de gateway transitória (5xx)', async () => {
    useCase.execute.mockRejectedValue(
      new AsaasGatewayException('Connection reset', 502),
    );

    const input = {
      subaccountId: 'subacc_1',
      transferData: { value: 100.0, pixAddressKey: 'user@pix.com' },
    };

    await consumer.handleSubaccountTransfer(input, mockContext);

    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });

  it('deve efetuar ack e não re-enfileirar em caso de erro de validação negocial', async () => {
    useCase.execute.mockRejectedValue(new Error('Saldo insuficiente para transferência'));

    const input = {
      subaccountId: 'subacc_1',
      transferData: { value: 1000.0, pixAddressKey: 'user@pix.com' },
    };

    await consumer.handleSubaccountTransfer(input, mockContext);

    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    expect(mockChannel.nack).not.toHaveBeenCalled();
  });
});
