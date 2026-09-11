import { Injectable } from '@nestjs/common';
import { WebhookEvent } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import {
  CreateWebhookEventData,
  IWebhookEventRepository,
} from './webhook-event.repository.interface';

@Injectable()
export class PrismaWebhookEventRepository implements IWebhookEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEventId(eventId: string): Promise<WebhookEvent | null> {
    return this.prisma.webhookEvent.findUnique({
      where: { eventId },
    });
  }

  async create(data: CreateWebhookEventData): Promise<WebhookEvent> {
    return this.prisma.webhookEvent.create({
      data: {
        eventId: data.eventId,
        event: data.event,
        asaasPaymentId: data.asaasPaymentId,
        payload: data.payload,
        processed: false,
      },
    });
  }

  async markProcessed(id: string): Promise<WebhookEvent> {
    return this.prisma.webhookEvent.update({
      where: { id },
      data: {
        processed: true,
        processedAt: new Date(),
      },
    });
  }

  async updateForwardStatus(
    id: string,
    forwardStatus: string,
    forwardError?: string | null,
  ): Promise<WebhookEvent> {
    return this.prisma.webhookEvent.update({
      where: { id },
      data: {
        forwardStatus,
        forwardError: forwardError ?? null,
      },
    });
  }
}
