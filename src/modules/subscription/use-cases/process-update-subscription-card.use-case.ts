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
import { CreditCardDto } from '../../payment/dto/credit-card.dto';
import { CreditCardHolderInfoDto } from '../../payment/dto/credit-card-holder-info.dto';

export interface ProcessUpdateSubscriptionCardInput {
  subscriptionId: string;
  remoteIp: string;
  creditCard?: CreditCardDto;
  encryptedCreditCard?: string;
  creditCardHolderInfo?: CreditCardHolderInfoDto;
  creditCardToken?: string;
}

@Injectable()
export class ProcessUpdateSubscriptionCardUseCase {
  private readonly logger = new Logger(ProcessUpdateSubscriptionCardUseCase.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY_TOKEN)
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly asaasClient: AsaasClientProvider,
    @Inject(EVENT_PUBLISHER_TOKEN)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(input: ProcessUpdateSubscriptionCardInput): Promise<void> {
    const subscription = await this.subscriptionRepository.findById(
      input.subscriptionId,
    );
    if (!subscription) {
      this.logger.warn(`Assinatura ${input.subscriptionId} não localizada.`);
      return;
    }

    if (!subscription.asaasSubscriptionId) {
      this.logger.error(`Assinatura ${subscription.id} não possui asaasSubscriptionId.`);
      return;
    }

    try {
      const payload: Record<string, any> = {
        remoteIp: input.remoteIp,
      };

      if (input.creditCardToken) {
        payload.creditCardToken = input.creditCardToken;
      } else if (input.creditCard) {
        payload.creditCard = input.creditCard;
        if (input.creditCardHolderInfo) {
          payload.creditCardHolderInfo = input.creditCardHolderInfo;
        }
      }

      const updateResult = await this.asaasClient.put<any>(
        `/v3/subscriptions/${subscription.asaasSubscriptionId}/creditCard`,
        payload,
      );

      await this.subscriptionRepository.update(subscription.id, {
        creditCardToken:
          updateResult?.creditCard?.creditCardToken ?? input.creditCardToken ?? subscription.creditCardToken,
        creditCardBrand: updateResult?.creditCard?.creditCardBrand ?? subscription.creditCardBrand,
        creditCardLast4: updateResult?.creditCard?.creditCardNumber ?? subscription.creditCardLast4,
        failureReason: null,
      });

      await this.eventPublisher.publish(EVENT_PATTERNS.WEBHOOK_FORWARD_TO_CLIENT, {
        event: 'SUBSCRIPTION_CARD_UPDATED',
        subscription: {
          id: subscription.id,
          asaasSubscriptionId: subscription.asaasSubscriptionId,
        },
      });

      this.logger.log(`Cartão da assinatura ${subscription.id} atualizado no Asaas.`);
    } catch (error: any) {
      this.logger.error(
        `Erro ao atualizar cartão da assinatura ${subscription.id}: ${error.message}`,
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
