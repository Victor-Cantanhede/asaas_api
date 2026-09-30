import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import {
  ProcessSubaccountTransferInput,
  ProcessSubaccountTransferUseCase,
} from '../use-cases/process-subaccount-transfer.use-case';
import { EVENT_PATTERNS } from '../../../infra/messaging/messaging.constants';

@Controller()
export class SubaccountTransferConsumer {
  private readonly logger = new Logger(SubaccountTransferConsumer.name);

  constructor(
    private readonly processSubaccountTransferUseCase: ProcessSubaccountTransferUseCase,
  ) {}

  @EventPattern(EVENT_PATTERNS.SUBACCOUNT_TRANSFER)
  async handleSubaccountTransfer(
    @Payload() data: ProcessSubaccountTransferInput,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log(`Processando transferência assíncrona para subconta: ${data.subaccountId}`);
      await this.processSubaccountTransferUseCase.execute(data);
      channel.ack(originalMsg);
      this.logger.log(`Evento subaccount.transfer confirmado (ack) para subconta: ${data.subaccountId}`);
    } catch (error: any) {
      this.logger.error(
        `Erro ao processar subaccount.transfer para subconta ${data.subaccountId}: ${error.message}`,
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
