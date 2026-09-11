import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  CUSTOMER_REPOSITORY_TOKEN,
  ICustomerRepository,
} from '../repositories/customer.repository.interface';
import { CustomerResponseDto } from '../dto/customer-response.dto';

@Injectable()
export class GetCustomerByExternalIdUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY_TOKEN)
    private readonly customerRepository: ICustomerRepository,
  ) {}

  async execute(externalId: string): Promise<CustomerResponseDto> {
    const customer = await this.customerRepository.findByExternalId(externalId);

    if (!customer) {
      throw new NotFoundException(
        `Cliente com externalId "${externalId}" não encontrado`,
      );
    }

    return {
      id: customer.id,
      externalId: customer.externalId,
      asaasCustomerId: customer.asaasCustomerId,
      name: customer.name,
      email: customer.email,
      cpfCnpj: customer.cpfCnpj,
      phone: customer.phone,
      status: customer.status,
      failureReason: customer.failureReason,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }
}
