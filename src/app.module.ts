import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validate } from './infra/config/env.validation';
import { asaasConfig } from './infra/config/asaas.config';
import { PrismaModule } from './infra/prisma/prisma.module';
import { MessagingModule } from './infra/messaging/messaging.module';
import { SecurityModule } from './infra/security/security.module';
import { AsaasClientModule } from './infra/asaas/asaas-client.module';
import { CustomerModule } from './modules/customer/customer.module';
import { PaymentModule } from './modules/payment/payment.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { WebhookModule } from './modules/webhook/webhook.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      load: [asaasConfig],
    }),
    PrismaModule,
    MessagingModule,
    SecurityModule,
    AsaasClientModule,
    CustomerModule,
    PaymentModule,
    SubscriptionModule,
    WebhookModule,
  ],
})
export class AppModule {}
