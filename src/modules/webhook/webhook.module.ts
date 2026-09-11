import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookConsumer } from './consumers/webhook.consumer';
import { WebhookForwarderConsumer } from './consumers/webhook-forwarder.consumer';
import { ProcessAsaasWebhookUseCase } from './use-cases/process-asaas-webhook.use-case';
import { AsaasWebhookAuthGuard } from './guards/asaas-webhook-auth.guard';
import { WEBHOOK_EVENT_REPOSITORY_TOKEN } from './repositories/webhook-event.repository.interface';
import { PrismaWebhookEventRepository } from './repositories/prisma-webhook-event.repository';
import { PaymentModule } from '../payment/payment.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [PaymentModule, SubscriptionModule],
  controllers: [WebhookController, WebhookConsumer, WebhookForwarderConsumer],
  providers: [
    AsaasWebhookAuthGuard,
    {
      provide: WEBHOOK_EVENT_REPOSITORY_TOKEN,
      useClass: PrismaWebhookEventRepository,
    },
    ProcessAsaasWebhookUseCase,
  ],
  exports: [WEBHOOK_EVENT_REPOSITORY_TOKEN, ProcessAsaasWebhookUseCase],
})
export class WebhookModule {}
