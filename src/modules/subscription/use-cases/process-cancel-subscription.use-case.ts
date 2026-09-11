import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  SUBSCRIPTION_REPOSITORY_TOKEN,
  ISubscriptionRepository,
} from '../repositories/subscription.repository.interface';
import { AsaasClientProvider } from '../../../infra/asaas/asaas-client.provider';
import { AsaasBadRequestException } from '../../../infra/asaas/errors';
import {
  EVENT_PUBLISHER_TOKEN,
  IEventPublisher,
} from '../../../infra/messaging/contracts/event-publisher.interface';
import { EVENT_PATTERNS } from '../../../infra/messaging/messaging.constants';

export interface ProcessCancelSubscriptionInput {
  subscriptionId: string;
}

@Injectable()
export class ProcessCancelSubscriptionUseCase {
  private readonly logger = new Logger(ProcessCancelSubscriptionUseCase.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY_TOKEN)
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly asaasClient: AsaasClientProvider,
    @Inject(EVENT_PUBLISHER_TOKEN)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(input: ProcessCancelSubscriptionInput): Promise<void> {
    const subscription = await this.subscriptionRepository.findById(
      input.subscriptionId,
    );
    if (!subscription) {
      this.logger.warn(`Assinatura ${input.subscriptionId} não localizada.`);
      return;
    }

    try {
      if (subscription.asaasSubscriptionId) {
        await this.asaasClient.delete(
          `/v3/subscriptions/${subscription.asaasSubscriptionId}`,
        );
      }

      await this.subscriptionRepository.updateStatus(subscription.id, 'INACTIVE', null);

      await this.eventPublisher.publish(EVENT_PATTERNS.WEBHOOK_FORWARD_TO_CLIENT, {
        event: 'SUBSCRIPTION_INACTIVATED',
        subscription: {
          id: subscription.id,
          asaasSubscriptionId: subscription.asaasSubscriptionId,
          status: 'INACTIVE',
        },
      });

      this.logger.log(`Assinatura ${subscription.id} cancelada com sucesso.`);
    } catch (error: any) {
      this.logger.error(
        `Falha ao cancelar assinatura ${subscription.id}: ${error.message}`,
      );

      const isValidationError = error instanceof AsaasBadRequestException;
      await this.subscriptionRepository.update(subscription.id, {
        failureReason: error.message,
      });

      if (!isValidationError) {
        throw error;
      }
    }
  }
}
