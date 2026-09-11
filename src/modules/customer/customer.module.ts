import { Module } from '@nestjs/common';
import { CustomerController } from './customer.controller';
import { CustomerConsumer } from './consumers/customer.consumer';
import { SyncCustomerUseCase } from './use-cases/sync-customer.use-case';
import { GetCustomerByExternalIdUseCase } from './use-cases/get-customer-by-external-id.use-case';
import { CUSTOMER_REPOSITORY_TOKEN } from './repositories/customer.repository.interface';
import { PrismaCustomerRepository } from './repositories/prisma-customer.repository';

@Module({
  controllers: [CustomerController, CustomerConsumer],
  providers: [
    {
      provide: CUSTOMER_REPOSITORY_TOKEN,
      useClass: PrismaCustomerRepository,
    },
    SyncCustomerUseCase,
    GetCustomerByExternalIdUseCase,
  ],
  exports: [CUSTOMER_REPOSITORY_TOKEN, SyncCustomerUseCase, GetCustomerByExternalIdUseCase],
})
export class CustomerModule {}
