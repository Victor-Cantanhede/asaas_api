import { Test, TestingModule } from '@nestjs/testing';
import { CustomerConsumer } from '../consumers/customer.consumer';
import { SyncCustomerUseCase } from '../use-cases/sync-customer.use-case';
import { RmqContext } from '@nestjs/microservices';
import { AsaasGatewayException } from '../../../infra/asaas/errors';

describe('CustomerConsumer', () => {
  let consumer: CustomerConsumer;
  let syncCustomerUseCaseMock: any;
  let channelMock: any;
  let contextMock: any;

  beforeEach(async () => {
    syncCustomerUseCaseMock = {
      execute: jest.fn().mockResolvedValue(undefined),
    };

    channelMock = {
      ack: jest.fn(),
      nack: jest.fn(),
    };

    contextMock = {
      getChannelRef: jest.fn().mockReturnValue(channelMock),
      getMessage: jest.fn().mockReturnValue({ content: 'raw_msg' }),
    } as unknown as RmqContext;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerConsumer],
      providers: [
        {
          provide: SyncCustomerUseCase,
          useValue: syncCustomerUseCaseMock,
        },
      ],
    }).compile();

    consumer = module.get<CustomerConsumer>(CustomerConsumer);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  it('should call SyncCustomerUseCase and acknowledge message on success', async () => {
    const payload = { customerId: 'cust_1', externalId: 'ext_1' };

    await consumer.handleCustomerSync(payload, contextMock);

    expect(syncCustomerUseCaseMock.execute).toHaveBeenCalledWith(payload);
    expect(channelMock.ack).toHaveBeenCalledWith({ content: 'raw_msg' });
    expect(channelMock.nack).not.toHaveBeenCalled();
  });

  it('should requeue message via nack if transient AsaasGatewayException occurs', async () => {
    syncCustomerUseCaseMock.execute.mockRejectedValue(
      new AsaasGatewayException('Gateway timeout', 504),
    );

    const payload = { customerId: 'cust_1', externalId: 'ext_1' };

    await consumer.handleCustomerSync(payload, contextMock);

    expect(channelMock.nack).toHaveBeenCalledWith({ content: 'raw_msg' }, false, true);
    expect(channelMock.ack).not.toHaveBeenCalled();
  });

  it('should acknowledge message via ack on business error to avoid clogging queue', async () => {
    syncCustomerUseCaseMock.execute.mockRejectedValue(new Error('Validation failed'));

    const payload = { customerId: 'cust_1', externalId: 'ext_1' };

    await consumer.handleCustomerSync(payload, contextMock);

    expect(channelMock.ack).toHaveBeenCalledWith({ content: 'raw_msg' });
    expect(channelMock.nack).not.toHaveBeenCalled();
  });
});
