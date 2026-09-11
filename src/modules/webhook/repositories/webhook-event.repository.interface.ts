import { WebhookEvent } from '@prisma/client';

export interface CreateWebhookEventData {
  eventId: string;
  event: string;
  asaasPaymentId?: string | null;
  payload: string;
}

export interface IWebhookEventRepository {
  findByEventId(eventId: string): Promise<WebhookEvent | null>;
  create(data: CreateWebhookEventData): Promise<WebhookEvent>;
  markProcessed(id: string): Promise<WebhookEvent>;
  updateForwardStatus(
    id: string,
    forwardStatus: string,
    forwardError?: string | null,
  ): Promise<WebhookEvent>;
}

export const WEBHOOK_EVENT_REPOSITORY_TOKEN = Symbol('IWebhookEventRepository');
