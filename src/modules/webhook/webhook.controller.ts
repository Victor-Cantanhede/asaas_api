import {
  Controller,
  UsePipes,
  ValidationPipe,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Inject,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { AsaasWebhookAuthGuard } from './guards/asaas-webhook-auth.guard';
import {
  EVENT_PUBLISHER_TOKEN,
  IEventPublisher,
} from '../../infra/messaging/contracts/event-publisher.interface';
import { EVENT_PATTERNS } from '../../infra/messaging/messaging.constants';
import { AsaasWebhookPayloadDto } from './dto/asaas-webhook-payload.dto';
import { WebhookResponseDto } from './dto/webhook-response.dto';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    @Inject(EVENT_PUBLISHER_TOKEN)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  @Post('asaas')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AsaasWebhookAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
  @ApiOperation({
    summary: 'Endpoint de recepção ultra-rápida de webhooks do Asaas (< 10ms)',
    description:
      'Valida o token de segurança no cabeçalho em memória, enfileira o evento "webhook.received" no RabbitMQ e responde imediatamente HTTP 200 OK.',
  })
  @ApiHeader({
    name: 'asaas-access-token',
    description: 'Token de segurança configurado na gestão de webhooks do Asaas',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook recebido e enfileirado para processamento assíncrono',
    type: WebhookResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Cabeçalho asaas-access-token inválido ou ausente',
  })
  async receiveAsaasWebhook(
    @Body() payload: AsaasWebhookPayloadDto,
  ): Promise<WebhookResponseDto> {
    const summary = `evento=${payload.event}, id=${payload.id || 'sem_id'}, paymentId=${payload.payment?.id || 'n/a'}, subId=${payload.subscription?.id || 'n/a'}`;
    this.logger.log(`[WebhookController] Notificação HTTP recebida do Asaas: ${summary}`);

    try {
      await this.eventPublisher.publish(
        EVENT_PATTERNS.WEBHOOK_RECEIVED,
        payload,
      );
      this.logger.log(
        `[WebhookController] Evento ${payload.event} (${payload.id || 'sem_id'}) enfileirado com sucesso em "${EVENT_PATTERNS.WEBHOOK_RECEIVED}".`,
      );
    } catch (pubError: any) {
      this.logger.error(
        `[WebhookController] Falha ao enfileirar webhook ${payload.event}: ${pubError.message}`,
        pubError.stack,
      );
      throw pubError;
    }

    return {
      received: true,
      message:
        'Webhook recebido com sucesso e enfileirado para processamento assíncrono.',
    };
  }
}
