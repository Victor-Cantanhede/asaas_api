import { Controller, Inject, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { ProcessAsaasWebhookUseCase } from '../use-cases/process-asaas-webhook.use-case';
import {
  EVENT_PUBLISHER_TOKEN,
  IEventPublisher,
} from '../../../infra/messaging/contracts/event-publisher.interface';
import { EVENT_PATTERNS } from '../../../infra/messaging/messaging.constants';
import { AsaasWebhookPayloadDto } from '../dto/asaas-webhook-payload.dto';

@Controller()
export class WebhookConsumer {
  private readonly logger = new Logger(WebhookConsumer.name);

  constructor(
    private readonly processAsaasWebhookUseCase: ProcessAsaasWebhookUseCase,
    @Inject(EVENT_PUBLISHER_TOKEN)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  @EventPattern(EVENT_PATTERNS.WEBHOOK_RECEIVED)
  async handleWebhookReceived(
    @Payload() payload: AsaasWebhookPayloadDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log(`Consumindo webhook.received para evento: ${payload?.id}`);
      const result = await this.processAsaasWebhookUseCase.execute(payload);

      if (!result.isDuplicate) {
        // Enfileira para repasse ao backend consumidor
        await this.eventPublisher.publish(
          EVENT_PATTERNS.WEBHOOK_FORWARD_TO_CLIENT,
          payload,
        );
      }

      channel.ack(originalMsg);
      this.logger.log(`Webhook ${payload?.id} processado com sucesso (ack).`);
    } catch (error: any) {
      this.logger.error(`Erro ao processar webhook.received: ${error.message}`);
      channel.ack(originalMsg);
    }
  }
}
