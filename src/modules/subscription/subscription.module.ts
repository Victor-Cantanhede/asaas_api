import { Module } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionConsumer } from './consumers/subscription.consumer';
import { ProcessCreateSubscriptionUseCase } from './use-cases/process-create-subscription.use-case';
import { ProcessUpdateSubscriptionCardUseCase } from './use-cases/process-update-subscription-card.use-case';
import { ProcessCancelSubscriptionUseCase } from './use-cases/process-cancel-subscription.use-case';
import { GetSubscriptionUseCase } from './use-cases/get-subscription.use-case';
import { SUBSCRIPTION_REPOSITORY_TOKEN } from './repositories/subscription.repository.interface';
import { PrismaSubscriptionRepository } from './repositories/prisma-subscription.repository';
import { CustomerModule } from '../customer/customer.module';

@Module({
  imports: [CustomerModule],
  controllers: [SubscriptionController, SubscriptionConsumer],
  providers: [
    {
      provide: SUBSCRIPTION_REPOSITORY_TOKEN,
      useClass: PrismaSubscriptionRepository,
    },
    ProcessCreateSubscriptionUseCase,
    ProcessUpdateSubscriptionCardUseCase,
    ProcessCancelSubscriptionUseCase,
    GetSubscriptionUseCase,
  ],
  exports: [
    SUBSCRIPTION_REPOSITORY_TOKEN,
    ProcessCreateSubscriptionUseCase,
    ProcessUpdateSubscriptionCardUseCase,
    ProcessCancelSubscriptionUseCase,
    GetSubscriptionUseCase,
  ],
})
export class SubscriptionModule {}
