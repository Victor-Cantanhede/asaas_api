import { Test, TestingModule } from '@nestjs/testing';
import { SubaccountConsumer } from '../consumers/subaccount.consumer';
import { CreateSubaccountUseCase } from '../use-cases/create-subaccount.use-case';
import { RmqContext } from '@nestjs/microservices';
import { AsaasGatewayException } from '../../../infra/asaas/errors';

describe('SubaccountConsumer', () => {
  let consumer: SubaccountConsumer;
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
      controllers: [SubaccountConsumer],
      providers: [
        {
          provide: CreateSubaccountUseCase,
          useValue: useCase,
        },
      ],
    }).compile();

    consumer = module.get<SubaccountConsumer>(SubaccountConsumer);
  });

  it('deve processar criação com sucesso e confirmar com ack no canal', async () => {
    await consumer.handleSubaccountCreate(
      { subaccountId: 'sub_1', externalId: 'freelancer_1' },
      mockContext,
    );

    expect(useCase.execute).toHaveBeenCalledWith({
      subaccountId: 'sub_1',
      externalId: 'freelancer_1',
    });
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    expect(mockChannel.nack).not.toHaveBeenCalled();
  });

  it('deve efetuar nack(requeue) em caso de falha de gateway transitória', async () => {
    useCase.execute.mockRejectedValue(
      new AsaasGatewayException('Connection reset', 502),
    );

    await consumer.handleSubaccountCreate(
      { subaccountId: 'sub_1', externalId: 'freelancer_1' },
      mockContext,
    );

    expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, true);
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });

  it('deve efetuar ack caso o erro não seja de infraestrutura (evita poison pill)', async () => {
    useCase.execute.mockRejectedValue(new Error('Validation error'));

    await consumer.handleSubaccountCreate(
      { subaccountId: 'sub_1', externalId: 'freelancer_1' },
      mockContext,
    );

    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    expect(mockChannel.nack).not.toHaveBeenCalled();
  });
});
