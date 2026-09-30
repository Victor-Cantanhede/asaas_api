import { Module } from '@nestjs/common';
import { SubaccountController } from './subaccount.controller';
import { SubaccountConsumer } from './consumers/subaccount.consumer';
import { SubaccountTransferConsumer } from './consumers/subaccount-transfer.consumer';
import { CreateSubaccountUseCase } from './use-cases/create-subaccount.use-case';
import { GetSubaccountByExternalIdUseCase } from './use-cases/get-subaccount-by-external-id.use-case';
import { ProcessSubaccountTransferUseCase } from './use-cases/process-subaccount-transfer.use-case';
import { SUBACCOUNT_REPOSITORY_TOKEN } from './repositories/subaccount.repository.interface';
import { PrismaSubaccountRepository } from './repositories/prisma-subaccount.repository';

@Module({
  controllers: [
    SubaccountController,
    SubaccountConsumer,
    SubaccountTransferConsumer,
  ],
  providers: [
    CreateSubaccountUseCase,
    GetSubaccountByExternalIdUseCase,
    ProcessSubaccountTransferUseCase,
    {
      provide: SUBACCOUNT_REPOSITORY_TOKEN,
      useClass: PrismaSubaccountRepository,
    },
  ],
  exports: [SUBACCOUNT_REPOSITORY_TOKEN],
})
export class SubaccountModule {}
