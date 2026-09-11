import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GetCustomerByExternalIdUseCase } from '../use-cases/get-customer-by-external-id.use-case';
import { CUSTOMER_REPOSITORY_TOKEN } from '../repositories/customer.repository.interface';

describe('GetCustomerByExternalIdUseCase', () => {
  let useCase: GetCustomerByExternalIdUseCase;
  let repositoryMock: any;

  beforeEach(async () => {
    repositoryMock = {
      findByExternalId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetCustomerByExternalIdUseCase,
        {
          provide: CUSTOMER_REPOSITORY_TOKEN,
          useValue: repositoryMock,
        },
      ],
    }).compile();

    useCase = module.get<GetCustomerByExternalIdUseCase>(
      GetCustomerByExternalIdUseCase,
    );
  });

  it('should return mapped customer response DTO when customer is found', async () => {
    const customer = {
      id: 'cust_1',
      externalId: 'ext_1',
      asaasCustomerId: 'cus_123',
      name: 'John Doe',
      email: 'john@example.com',
      cpfCnpj: '12345678901',
      phone: '11988887777',
      status: 'SYNCED',
      failureReason: null,
      createdAt: new Date('2026-09-10T15:30:00.000Z'),
      updatedAt: new Date('2026-09-10T15:30:02.000Z'),
    };

    repositoryMock.findByExternalId.mockResolvedValue(customer);

    const result = await useCase.execute('ext_1');

    expect(repositoryMock.findByExternalId).toHaveBeenCalledWith('ext_1');
    expect(result).toEqual(customer);
  });

  it('should throw NotFoundException when customer is not found', async () => {
    repositoryMock.findByExternalId.mockResolvedValue(null);

    await expect(useCase.execute('non_existing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
