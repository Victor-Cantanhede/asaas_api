import { Controller, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import {
  WEBHOOK_EVENT_REPOSITORY_TOKEN,
  IWebhookEventRepository,
} from '../repositories/webhook-event.repository.interface';
import { EVENT_PATTERNS } from '../../../infra/messaging/messaging.constants';

@Controller()
export class WebhookForwarderConsumer {
  private readonly logger = new Logger(WebhookForwarderConsumer.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(WEBHOOK_EVENT_REPOSITORY_TOKEN)
    private readonly webhookEventRepository: IWebhookEventRepository,
  ) {}

  @EventPattern(EVENT_PATTERNS.WEBHOOK_FORWARD_TO_CLIENT)
  async handleForwardToClient(@Payload() payload: any, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    const clientWebhookUrl = this.configService.get<string>('CLIENT_WEBHOOK_URL');
    const clientSecret = this.configService.get<string>(
      'CLIENT_WEBHOOK_SECRET',
      '',
    );

    if (!clientWebhookUrl) {
      this.logger.debug(
        'CLIENT_WEBHOOK_URL não configurada; repasse de webhook omitido.',
      );
      channel.ack(originalMsg);
      return;
    }

    const eventId = payload?.id;
    let localEvent: any = null;
    if (eventId) {
      localEvent = await this.webhookEventRepository.findByEventId(eventId);
    }

    try {
      this.logger.log(`Repassando webhook para o backend consumidor em ${clientWebhookUrl}`);

      const response = await fetch(clientWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': clientSecret,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Consumidor respondeu com status HTTP ${response.status}`);
      }

      if (localEvent) {
        await this.webhookEventRepository.updateForwardStatus(
          localEvent.id,
          'FORWARDED',
          null,
        );
      }

      channel.ack(originalMsg);
      this.logger.log(`Webhook repassado com sucesso para ${clientWebhookUrl}`);
    } catch (error: any) {
      this.logger.warn(`Falha ao repassar webhook para ${clientWebhookUrl}: ${error.message}`);

      if (localEvent) {
        await this.webhookEventRepository.updateForwardStatus(
          localEvent.id,
          'FAILED',
          error.message,
        );
      }

      // Confirma ack no canal para não reter a fila caso o endpoint do cliente esteja offline
      channel.ack(originalMsg);
    }
  }
}
