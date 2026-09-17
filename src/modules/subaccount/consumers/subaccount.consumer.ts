import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import {
  CreateSubaccountInput,
  CreateSubaccountUseCase,
} from '../use-cases/create-subaccount.use-case';
import { EVENT_PATTERNS } from '../../../infra/messaging/messaging.constants';

@Controller()
export class SubaccountConsumer {
  private readonly logger = new Logger(SubaccountConsumer.name);

  constructor(private readonly createSubaccountUseCase: CreateSubaccountUseCase) {}

  @EventPattern(EVENT_PATTERNS.SUBACCOUNT_CREATE)
  async handleSubaccountCreate(
    @Payload() data: CreateSubaccountInput,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log(`Processando criação assíncrona de subconta: ${data.externalId}`);
      await this.createSubaccountUseCase.execute(data);
      channel.ack(originalMsg);
      this.logger.log(`Evento subaccount.create confirmado (ack): ${data.externalId}`);
    } catch (error: any) {
      this.logger.error(
        `Erro ao processar subaccount.create para ${data.externalId}: ${error.message}`,
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
