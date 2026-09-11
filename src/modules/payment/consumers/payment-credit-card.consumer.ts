import { Controller, Logger, Optional } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import {
  ProcessCreditCardPaymentInput,
  ProcessCreditCardPaymentUseCase,
} from '../use-cases/process-credit-card-payment.use-case';
import { EVENT_PATTERNS } from '../../../infra/messaging/messaging.constants';
import { CardEncryptionService } from '../../../infra/security/card-encryption.service';

@Controller()
export class PaymentCreditCardConsumer {
  private readonly logger = new Logger(PaymentCreditCardConsumer.name);

  constructor(
    private readonly processCreditCardPaymentUseCase: ProcessCreditCardPaymentUseCase,
    @Optional()
    private readonly cardEncryptionService?: CardEncryptionService,
  ) {}

  @EventPattern(EVENT_PATTERNS.PAYMENT_CHARGE_CREDIT_CARD)
  async handleChargeCreditCard(
    @Payload() data: ProcessCreditCardPaymentInput,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      if (data.encryptedCreditCard && !data.creditCard && this.cardEncryptionService) {
        data.creditCard = this.cardEncryptionService.decrypt(data.encryptedCreditCard);
      }

      this.logger.log(`Processando débito de cartão assíncrono: ${data.paymentId}`);
      await this.processCreditCardPaymentUseCase.execute(data);
      channel.ack(originalMsg);
      this.logger.log(
        `Evento payment.charge_credit_card confirmado (ack): ${data.paymentId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Erro ao processar payment.charge_credit_card para ${data.paymentId}: ${error.message}`,
      );

      const shouldRequeue =
        error?.status >= 500 || error?.name === 'AsaasGatewayException';

      if (shouldRequeue) {
        channel.nack(originalMsg, false, true);
      } else {
        channel.ack(originalMsg);
      }
    }
  }
}
