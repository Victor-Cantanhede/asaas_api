import { Test, TestingModule } from '@nestjs/testing';
import { SyncCustomerUseCase } from '../use-cases/sync-customer.use-case';
import { CUSTOMER_REPOSITORY_TOKEN } from '../repositories/customer.repository.interface';
import { AsaasClientProvider } from '../../../infra/asaas/asaas-client.provider';
import { AsaasBadRequestException, AsaasGatewayException } from '../../../infra/asaas/errors';

describe('SyncCustomerUseCase', () => {
  let useCase: SyncCustomerUseCase;
  let repositoryMock: any;
  let asaasClientMock: any;

  beforeEach(async () => {
    repositoryMock = {
      findById: jest.fn(),
      updateSynced: jest.fn().mockResolvedValue({}),
      updateStatus: jest.fn().mockResolvedValue({}),
    };

    asaasClientMock = {
      get: jest.fn(),
      post: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncCustomerUseCase,
        {
          provide: CUSTOMER_REPOSITORY_TOKEN,
          useValue: repositoryMock,
        },
        {
          provide: AsaasClientProvider,
          useValue: asaasClientMock,
        },
      ],
    }).compile();

    useCase = module.get<SyncCustomerUseCase>(SyncCustomerUseCase);
  });

  it('should be defined', () => {
    expect(useCase).toBeDefined();
  });

  it('should sync existing customer found in Asaas without creating a new one', async () => {
    const customer = {
      id: 'cust_1',
      externalId: 'ext_1',
      name: 'John Doe',
      email: 'john@example.com',
      cpfCnpj: '24971563792',
      asaasCustomerId: null,
    };

    repositoryMock.findById.mockResolvedValue(customer);
    asaasClientMock.get.mockResolvedValue({
      data: [{ id: 'cus_existing_999' }],
    });

    await useCase.execute({ customerId: 'cust_1', externalId: 'ext_1' });

    expect(asaasClientMock.get).toHaveBeenCalledWith('/v3/customers', {
      externalReference: 'ext_1',
    });
    expect(asaasClientMock.post).not.toHaveBeenCalled();
    expect(repositoryMock.updateSynced).toHaveBeenCalledWith('cust_1', 'cus_existing_999');
  });

  it('should create customer in Asaas when not found and update to SYNCED', async () => {
    const customer = {
      id: 'cust_2',
      externalId: 'ext_2',
      name: 'Jane Doe',
      email: 'jane@example.com',
      cpfCnpj: null,
      phone: '1199999999',
      asaasCustomerId: null,
    };

    repositoryMock.findById.mockResolvedValue(customer);
    asaasClientMock.get.mockResolvedValue({ data: [] });
    asaasClientMock.post.mockResolvedValue({ id: 'cus_created_123' });

    await useCase.execute({ customerId: 'cust_2', externalId: 'ext_2' });

    expect(asaasClientMock.post).toHaveBeenCalledWith('/v3/customers', {
      name: 'Jane Doe',
      email: 'jane@example.com',
      externalReference: 'ext_2',
      phone: '1199999999',
    });
    expect(repositoryMock.updateSynced).toHaveBeenCalledWith('cust_2', 'cus_created_123');
  });

  it('should mark customer as FAILED when Asaas returns AsaasBadRequestException and not rethrow', async () => {
    const customer = {
      id: 'cust_3',
      externalId: 'ext_3',
      name: 'Bad Customer',
      email: 'invalid-email',
      asaasCustomerId: null,
    };

    repositoryMock.findById.mockResolvedValue(customer);
    asaasClientMock.get.mockResolvedValue({ data: [] });
    asaasClientMock.post.mockRejectedValue(
      new AsaasBadRequestException('E-mail informado é inválido'),
    );

    await expect(
      useCase.execute({ customerId: 'cust_3', externalId: 'ext_3' }),
    ).resolves.not.toThrow();

    expect(repositoryMock.updateStatus).toHaveBeenCalledWith(
      'cust_3',
      'FAILED',
      'E-mail informado é inválido',
    );
  });

  it('should mark customer as FAILED and rethrow when transient AsaasGatewayException occurs', async () => {
    const customer = {
      id: 'cust_4',
      externalId: 'ext_4',
      name: 'Retry Customer',
      email: 'retry@example.com',
      asaasCustomerId: null,
    };

    repositoryMock.findById.mockResolvedValue(customer);
    asaasClientMock.get.mockRejectedValue(new AsaasGatewayException('Connection reset', 502));

    await expect(
      useCase.execute({ customerId: 'cust_4', externalId: 'ext_4' }),
    ).rejects.toThrow(AsaasGatewayException);

    expect(repositoryMock.updateStatus).toHaveBeenCalledWith(
      'cust_4',
      'FAILED',
      expect.stringContaining('Connection reset'),
    );
  });
});
