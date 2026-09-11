import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Inject,
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
  constructor(
    @Inject(EVENT_PUBLISHER_TOKEN)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  @Post('asaas')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AsaasWebhookAuthGuard)
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
    await this.eventPublisher.publish(
      EVENT_PATTERNS.WEBHOOK_RECEIVED,
      payload,
    );

    return {
      received: true,
      message:
        'Webhook recebido com sucesso e enfileirado para processamento assíncrono.',
    };
  }
}
