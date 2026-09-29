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
    const eventIdentifier = payload?.id || payload?.event || 'desconhecido';

    try {
      this.logger.log(
        `[WebhookConsumer] Consumindo webhook.received: evento=${payload?.event}, id=${payload?.id || 'sem_id'}, paymentId=${payload?.payment?.id || 'n/a'}, subId=${payload?.subscription?.id || 'n/a'}`,
      );
      const result = await this.processAsaasWebhookUseCase.execute(payload);

      if (result.isDuplicate) {
        this.logger.warn(
          `[WebhookConsumer] Evento duplicado detectado (${eventIdentifier}). Descarte idempotente concluído sem repasse.`,
        );
      } else {
        this.logger.log(
          `[WebhookConsumer] Evento ${eventIdentifier} processado localmente. Publicando "${EVENT_PATTERNS.WEBHOOK_FORWARD_TO_CLIENT}" para repasse ao backend consumidor.`,
        );
        await this.eventPublisher.publish(
          EVENT_PATTERNS.WEBHOOK_FORWARD_TO_CLIENT,
          payload,
        );
      }

      channel.ack(originalMsg);
      this.logger.log(
        `[WebhookConsumer] Webhook ${eventIdentifier} finalizado com sucesso no RabbitMQ (ack).`,
      );
    } catch (error: any) {
      this.logger.error(
        `[WebhookConsumer] Falha ao processar webhook.received (${eventIdentifier}): ${error.message}`,
        error.stack,
      );
      channel.ack(originalMsg);
    }
  }
}
