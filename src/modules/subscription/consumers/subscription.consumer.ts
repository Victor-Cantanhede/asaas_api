import { Controller, Logger, Optional } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import {
  ProcessCreateSubscriptionInput,
  ProcessCreateSubscriptionUseCase,
} from '../use-cases/process-create-subscription.use-case';
import {
  ProcessUpdateSubscriptionCardInput,
  ProcessUpdateSubscriptionCardUseCase,
} from '../use-cases/process-update-subscription-card.use-case';
import {
  ProcessCancelSubscriptionInput,
  ProcessCancelSubscriptionUseCase,
} from '../use-cases/process-cancel-subscription.use-case';
import { EVENT_PATTERNS } from '../../../infra/messaging/messaging.constants';
import { CardEncryptionService } from '../../../infra/security/card-encryption.service';

@Controller()
export class SubscriptionConsumer {
  private readonly logger = new Logger(SubscriptionConsumer.name);

  constructor(
    private readonly processCreateSubscriptionUseCase: ProcessCreateSubscriptionUseCase,
    private readonly processUpdateSubscriptionCardUseCase: ProcessUpdateSubscriptionCardUseCase,
    private readonly processCancelSubscriptionUseCase: ProcessCancelSubscriptionUseCase,
    @Optional()
    private readonly cardEncryptionService?: CardEncryptionService,
  ) {}

  @EventPattern(EVENT_PATTERNS.SUBSCRIPTION_CREATE)
  async handleCreateSubscription(
    @Payload() data: ProcessCreateSubscriptionInput,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      if (data.encryptedCreditCard && !data.creditCard && this.cardEncryptionService) {
        data.creditCard = this.cardEncryptionService.decrypt(data.encryptedCreditCard);
      }

      this.logger.log(`Processando criação de assinatura: ${data.subscriptionId}`);
      await this.processCreateSubscriptionUseCase.execute(data);
      channel.ack(originalMsg);
      this.logger.log(`Evento subscription.create confirmado (ack): ${data.subscriptionId}`);
    } catch (error: any) {
      this.logger.error(
        `Erro ao processar subscription.create para ${data.subscriptionId}: ${error.message}`,
      );

      const shouldRequeue =
        error?.status >= 500 || error?.name === 'AsaasGatewayException';

      if (shouldRequeue) {
        channel.nack(originalMsg, false, true);
      } else {
        channel.ack(originalMsg);
      }
    }
  }

  @EventPattern(EVENT_PATTERNS.SUBSCRIPTION_UPDATE_CARD)
  async handleUpdateSubscriptionCard(
    @Payload() data: ProcessUpdateSubscriptionCardInput,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      if (data.encryptedCreditCard && !data.creditCard && this.cardEncryptionService) {
        data.creditCard = this.cardEncryptionService.decrypt(data.encryptedCreditCard);
      }

      this.logger.log(`Processando alteração de cartão da assinatura: ${data.subscriptionId}`);
      await this.processUpdateSubscriptionCardUseCase.execute(data);
      channel.ack(originalMsg);
      this.logger.log(`Evento subscription.update_card confirmado (ack): ${data.subscriptionId}`);
    } catch (error: any) {
      this.logger.error(
        `Erro ao processar subscription.update_card para ${data.subscriptionId}: ${error.message}`,
      );

      const shouldRequeue =
        error?.status >= 500 || error?.name === 'AsaasGatewayException';

      if (shouldRequeue) {
        channel.nack(originalMsg, false, true);
      } else {
        channel.ack(originalMsg);
      }
    }
  }

  @EventPattern(EVENT_PATTERNS.SUBSCRIPTION_CANCEL)
  async handleCancelSubscription(
    @Payload() data: ProcessCancelSubscriptionInput,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log(`Processando cancelamento da assinatura: ${data.subscriptionId}`);
      await this.processCancelSubscriptionUseCase.execute(data);
      channel.ack(originalMsg);
      this.logger.log(`Evento subscription.cancel confirmado (ack): ${data.subscriptionId}`);
    } catch (error: any) {
      this.logger.error(
        `Erro ao processar subscription.cancel para ${data.subscriptionId}: ${error.message}`,
      );

      const shouldRequeue =
        error?.status >= 500 || error?.name === 'AsaasGatewayException';

      if (shouldRequeue) {
        channel.nack(originalMsg, false, true);
      } else {
        channel.ack(originalMsg);
      }
    }
  }
}
