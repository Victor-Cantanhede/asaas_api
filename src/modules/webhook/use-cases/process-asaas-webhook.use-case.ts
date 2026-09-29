import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  WEBHOOK_EVENT_REPOSITORY_TOKEN,
  IWebhookEventRepository,
} from '../repositories/webhook-event.repository.interface';
import {
  PAYMENT_REPOSITORY_TOKEN,
  IPaymentRepository,
} from '../../payment/repositories/payment.repository.interface';
import {
  SUBSCRIPTION_REPOSITORY_TOKEN,
  ISubscriptionRepository,
} from '../../subscription/repositories/subscription.repository.interface';
import { AsaasWebhookPayloadDto } from '../dto/asaas-webhook-payload.dto';
import { WebhookEvent } from '@prisma/client';

export interface ProcessWebhookResult {
  isDuplicate: boolean;
  webhookEvent: WebhookEvent | null;
}

@Injectable()
export class ProcessAsaasWebhookUseCase {
  private readonly logger = new Logger(ProcessAsaasWebhookUseCase.name);

  constructor(
    @Inject(WEBHOOK_EVENT_REPOSITORY_TOKEN)
    private readonly webhookEventRepository: IWebhookEventRepository,
    @Inject(PAYMENT_REPOSITORY_TOKEN)
    private readonly paymentRepository: IPaymentRepository,
    @Inject(SUBSCRIPTION_REPOSITORY_TOKEN)
    private readonly subscriptionRepository: ISubscriptionRepository,
  ) {}

  async execute(payload: AsaasWebhookPayloadDto): Promise<ProcessWebhookResult> {
    const eventId = payload.id || `evt_${payload.payment?.id || payload.subscription?.id || 'gen'}_${payload.event}_${Date.now()}`;
    const existing = await this.webhookEventRepository.findByEventId(eventId);
    if (existing) {
      this.logger.warn(`[ProcessAsaasWebhookUseCase] Evento ${eventId} já recebido anteriormente (descarte idempotente).`);
      return { isDuplicate: true, webhookEvent: existing };
    }

    const asaasPaymentId = payload.payment?.id ?? null;
    const webhookEvent = await this.webhookEventRepository.create({
      eventId,
      event: payload.event,
      asaasPaymentId,
      payload: JSON.stringify(payload),
    });

    this.logger.log(
      `[ProcessAsaasWebhookUseCase] Evento ${eventId} (${payload.event}) registrado na auditoria webhook_events (id: ${webhookEvent.id}).`,
    );

    try {
      // 1. Atualização de Pagamento se aplicável
      if (asaasPaymentId) {
        const payment = await this.paymentRepository.findByAsaasPaymentId(asaasPaymentId);
        if (payment) {
          const updateData: Record<string, any> = {};

          if (payload.payment?.status) {
            updateData.status = payload.payment.status;
          } else if (payload.event === 'PAYMENT_CONFIRMED' || payload.event === 'PAYMENT_RECEIVED') {
            updateData.status = 'CONFIRMED';
          } else if (payload.event === 'PAYMENT_REFUNDED') {
            updateData.status = 'REFUNDED';
          }

          if (payload.payment?.netValue !== undefined) {
            updateData.netValue = payload.payment.netValue;
          }
          if (payload.payment?.paymentDate) {
            updateData.paymentDate = new Date(payload.payment.paymentDate);
          }

          if ((payload.payment as any)?.escrow?.status) {
            updateData.escrowStatus = (payload.payment as any).escrow.status;
          } else if (payload.event === 'ESCROW_FINISHED') {
            updateData.escrowStatus = 'FINISHED';
            updateData.escrowFinishDate = new Date();
          }

          if ((payload.payment as any)?.escrow?.finishDate) {
            updateData.escrowFinishDate = new Date((payload.payment as any).escrow.finishDate);
          }

          await this.paymentRepository.update(payment.id, updateData);
          this.logger.log(
            `[ProcessAsaasWebhookUseCase] Pagamento local ${payment.id} (asaasPaymentId: ${asaasPaymentId}) atualizado pelo webhook ${payload.event}. Dados: ${JSON.stringify(updateData)}`,
          );
        } else {
          this.logger.warn(
            `[ProcessAsaasWebhookUseCase] Cobrança Asaas "${asaasPaymentId}" recebida no evento ${payload.event}, mas nenhum pagamento local correspondente foi localizado.`,
          );
        }
      }

      // 2. Atualização de Assinatura se aplicável
      if (payload.subscription?.id) {
        const subscription = await this.subscriptionRepository.findByAsaasSubscriptionId(
          payload.subscription.id,
        );
        if (subscription) {
          const updateData: Record<string, any> = {};
          if (payload.subscription.status) {
            updateData.status = payload.subscription.status;
          }
          if (payload.subscription.nextDueDate) {
            updateData.nextDueDate = new Date(payload.subscription.nextDueDate);
          }

          await this.subscriptionRepository.update(subscription.id, updateData);
          this.logger.log(
            `[ProcessAsaasWebhookUseCase] Assinatura local ${subscription.id} (asaasSubscriptionId: ${payload.subscription.id}) atualizada pelo webhook ${payload.event}. Dados: ${JSON.stringify(updateData)}`,
          );
        } else {
          this.logger.warn(
            `[ProcessAsaasWebhookUseCase] Assinatura Asaas "${payload.subscription.id}" recebida no evento ${payload.event}, mas nenhuma assinatura local correspondente foi localizada.`,
          );
        }
      }

      await this.webhookEventRepository.markProcessed(webhookEvent.id);
      this.logger.log(
        `[ProcessAsaasWebhookUseCase] WebhookEvent ${webhookEvent.id} (${eventId}) marcado como processado com sucesso.`,
      );
      return { isDuplicate: false, webhookEvent };
    } catch (error: any) {
      this.logger.error(
        `[ProcessAsaasWebhookUseCase] Erro ao processar entidades do webhook ${eventId} (${payload.event}): ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
