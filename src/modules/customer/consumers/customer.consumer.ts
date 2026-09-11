import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { SyncCustomerUseCase } from '../use-cases/sync-customer.use-case';
import { EVENT_PATTERNS } from '../../../infra/messaging/messaging.constants';

@Controller()
export class CustomerConsumer {
  private readonly logger = new Logger(CustomerConsumer.name);

  constructor(private readonly syncCustomerUseCase: SyncCustomerUseCase) {}

  @EventPattern(EVENT_PATTERNS.CUSTOMER_SYNC)
  async handleCustomerSync(
    @Payload() data: { customerId: string; externalId: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log(
        `Iniciando processamento do evento customer.sync para o cliente: ${data.externalId}`,
      );

      await this.syncCustomerUseCase.execute(data);

      channel.ack(originalMsg);
      this.logger.log(`Evento customer.sync confirmado (ack) para ${data.externalId}`);
    } catch (error: any) {
      this.logger.error(
        `Erro ao processar customer.sync para ${data.externalId}: ${error.message}`,
      );

      // Em erro de infraestrutura transitória (conexão com Asaas, timeout), requeueia
      const shouldRequeue = error?.status >= 500 || error?.name === 'AsaasGatewayException';

      if (shouldRequeue) {
        channel.nack(originalMsg, false, true);
      } else {
        // Erros de negócio ou cliente inválido: confirma ack para não travar a fila
        channel.ack(originalMsg);
      }
    }
  }
}
