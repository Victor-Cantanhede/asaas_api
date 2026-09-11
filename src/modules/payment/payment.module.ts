import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentPixConsumer } from './consumers/payment-pix.consumer';
import { PaymentCreditCardConsumer } from './consumers/payment-credit-card.consumer';
import { ProcessPixPaymentUseCase } from './use-cases/process-pix-payment.use-case';
import { ProcessCreditCardPaymentUseCase } from './use-cases/process-credit-card-payment.use-case';
import { GetPaymentUseCase } from './use-cases/get-payment.use-case';
import { PAYMENT_REPOSITORY_TOKEN } from './repositories/payment.repository.interface';
import { PrismaPaymentRepository } from './repositories/prisma-payment.repository';
import { CustomerModule } from '../customer/customer.module';

@Module({
  imports: [CustomerModule],
  controllers: [PaymentController, PaymentPixConsumer, PaymentCreditCardConsumer],
  providers: [
    {
      provide: PAYMENT_REPOSITORY_TOKEN,
      useClass: PrismaPaymentRepository,
    },
    ProcessPixPaymentUseCase,
    ProcessCreditCardPaymentUseCase,
    GetPaymentUseCase,
  ],
  exports: [
    PAYMENT_REPOSITORY_TOKEN,
    ProcessPixPaymentUseCase,
    ProcessCreditCardPaymentUseCase,
    GetPaymentUseCase,
  ],
})
export class PaymentModule {}
