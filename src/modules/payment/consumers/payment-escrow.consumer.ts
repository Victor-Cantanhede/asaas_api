import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import {
  ProcessReleaseEscrowInput,
  ProcessReleaseEscrowUseCase,
} from '../use-cases/process-release-escrow.use-case';
import { EVENT_PATTERNS } from '../../../infra/messaging/messaging.constants';

@Controller()
export class PaymentEscrowConsumer {
  private readonly logger = new Logger(PaymentEscrowConsumer.name);

  constructor(
    private readonly processReleaseEscrowUseCase: ProcessReleaseEscrowUseCase,
  ) {}

  @EventPattern(EVENT_PATTERNS.PAYMENT_RELEASE_ESCROW)
  async handleReleaseEscrow(
    @Payload() data: ProcessReleaseEscrowInput,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log(`Consumindo payment.release_escrow para pagamento: ${data.paymentId}`);
      await this.processReleaseEscrowUseCase.execute(data);
      channel.ack(originalMsg);
      this.logger.log(`Evento payment.release_escrow confirmado (ack): ${data.paymentId}`);
    } catch (error: any) {
      this.logger.error(
        `Erro ao processar payment.release_escrow para ${data.paymentId}: ${error.message}`,
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
