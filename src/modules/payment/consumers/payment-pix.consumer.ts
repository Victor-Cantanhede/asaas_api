import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { ProcessPixPaymentUseCase } from '../use-cases/process-pix-payment.use-case';
import { EVENT_PATTERNS } from '../../../infra/messaging/messaging.constants';

@Controller()
export class PaymentPixConsumer {
  private readonly logger = new Logger(PaymentPixConsumer.name);

  constructor(private readonly processPixPaymentUseCase: ProcessPixPaymentUseCase) {}

  @EventPattern(EVENT_PATTERNS.PAYMENT_CREATE_PIX)
  async handleCreatePix(
    @Payload() data: { paymentId: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log(`Processando criação assíncrona de PIX: ${data.paymentId}`);
      await this.processPixPaymentUseCase.execute(data);
      channel.ack(originalMsg);
      this.logger.log(`Evento payment.create_pix confirmado (ack): ${data.paymentId}`);
    } catch (error: any) {
      this.logger.error(
        `Erro ao processar payment.create_pix para ${data.paymentId}: ${error.message}`,
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
