import { Test, TestingModule } from '@nestjs/testing';
import { CustomerController } from '../customer.controller';
import { CUSTOMER_REPOSITORY_TOKEN } from '../repositories/customer.repository.interface';
import { EVENT_PUBLISHER_TOKEN } from '../../../infra/messaging/contracts/event-publisher.interface';
import { GetCustomerByExternalIdUseCase } from '../use-cases/get-customer-by-external-id.use-case';
import { ConfigService } from '@nestjs/config';

describe('CustomerController', () => {
  let controller: CustomerController;
  let repositoryMock: any;
  let publisherMock: any;
  let getUseCaseMock: any;

  beforeEach(async () => {
    repositoryMock = {
      upsertInitial: jest.fn().mockResolvedValue({
        id: 'cust_uuid_1',
        externalId: 'ext_1',
        status: 'RECEIVED',
        createdAt: new Date('2026-09-10T15:30:00.000Z'),
      }),
    };

    publisherMock = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    getUseCaseMock = {
      execute: jest.fn().mockResolvedValue({
        id: 'cust_uuid_1',
        externalId: 'ext_1',
        status: 'SYNCED',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerController],
      providers: [
        {
          provide: CUSTOMER_REPOSITORY_TOKEN,
          useValue: repositoryMock,
        },
        {
          provide: EVENT_PUBLISHER_TOKEN,
          useValue: publisherMock,
        },
        {
          provide: GetCustomerByExternalIdUseCase,
          useValue: getUseCaseMock,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test_key') },
        },
      ],
    }).compile();

    controller = module.get<CustomerController>(CustomerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should persist initial customer with RECEIVED and publish customer.sync returning 202 tracking payload', async () => {
    const dto = {
      externalId: 'ext_1',
      name: 'John Doe',
      email: 'john@example.com',
    };

    const response = await controller.createOrGetCustomer(dto);

    expect(repositoryMock.upsertInitial).toHaveBeenCalledWith(dto);
    expect(publisherMock.publish).toHaveBeenCalledWith('customer.sync', {
      customerId: 'cust_uuid_1',
      externalId: 'ext_1',
    });
    expect(response).toEqual({
      trackingId: 'cust_uuid_1',
      status: 'RECEIVED',
      message: 'Solicitação de sincronização de cliente enfileirada com sucesso.',
      createdAt: '2026-09-10T15:30:00.000Z',
      checkStatusUrl: '/customers/ext_1',
    });
  });

  it('should delegate GET /customers/:externalId to GetCustomerByExternalIdUseCase', async () => {
    const result = await controller.getByExternalId('ext_1');

    expect(getUseCaseMock.execute).toHaveBeenCalledWith('ext_1');
    expect(result.externalId).toBe('ext_1');
  });
});
