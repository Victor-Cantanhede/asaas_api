import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  SUBSCRIPTION_REPOSITORY_TOKEN,
  ISubscriptionRepository,
} from '../repositories/subscription.repository.interface';
import {
  CUSTOMER_REPOSITORY_TOKEN,
  ICustomerRepository,
} from '../../customer/repositories/customer.repository.interface';
import { SyncCustomerUseCase } from '../../customer/use-cases/sync-customer.use-case';
import { AsaasClientProvider } from '../../../infra/asaas/asaas-client.provider';
import { AsaasBadRequestException } from '../../../infra/asaas/errors';
import {
  EVENT_PUBLISHER_TOKEN,
  IEventPublisher,
} from '../../../infra/messaging/contracts/event-publisher.interface';
import { EVENT_PATTERNS } from '../../../infra/messaging/messaging.constants';
import { CreditCardDto } from '../../payment/dto/credit-card.dto';
import { CreditCardHolderInfoDto } from '../../payment/dto/credit-card-holder-info.dto';

export interface ProcessCreateSubscriptionInput {
  subscriptionId: string;
  remoteIp: string;
  creditCard?: CreditCardDto;
  encryptedCreditCard?: string;
  creditCardHolderInfo?: CreditCardHolderInfoDto;
  creditCardToken?: string;
}

@Injectable()
export class ProcessCreateSubscriptionUseCase {
  private readonly logger = new Logger(ProcessCreateSubscriptionUseCase.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY_TOKEN)
    private readonly subscriptionRepository: ISubscriptionRepository,
    @Inject(CUSTOMER_REPOSITORY_TOKEN)
    private readonly customerRepository: ICustomerRepository,
    private readonly syncCustomerUseCase: SyncCustomerUseCase,
    private readonly asaasClient: AsaasClientProvider,
    @Inject(EVENT_PUBLISHER_TOKEN)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(input: ProcessCreateSubscriptionInput): Promise<void> {
    const subscription = await this.subscriptionRepository.findById(
      input.subscriptionId,
    );
    if (!subscription) {
      this.logger.warn(`Assinatura ${input.subscriptionId} não localizada.`);
      return;
    }

    let customer = await this.customerRepository.findById(subscription.customerId);
    if (!customer) {
      this.logger.error(`Cliente ${subscription.customerId} não encontrado.`);
      await this.subscriptionRepository.updateStatus(
        subscription.id,
        'FAILED',
        'Cliente associado à assinatura não localizado',
      );
      return;
    }

    if (!customer.asaasCustomerId) {
      await this.syncCustomerUseCase.execute({
        customerId: customer.id,
        externalId: customer.externalId,
      });
      customer = await this.customerRepository.findById(subscription.customerId);
    }

    if (!customer?.asaasCustomerId) {
      await this.subscriptionRepository.updateStatus(
        subscription.id,
        'FAILED',
        'Não foi possível sincronizar o cliente no Asaas',
      );
      return;
    }

    try {
      const payload: Record<string, any> = {
        customer: customer.asaasCustomerId,
        billingType: 'CREDIT_CARD',
        value: subscription.value,
        cycle: subscription.cycle,
        remoteIp: input.remoteIp,
      };

      if (subscription.nextDueDate) {
        payload.nextDueDate = subscription.nextDueDate.toISOString().split('T')[0];
      }

      if (subscription.externalReference) {
        payload.externalReference = subscription.externalReference;
      }

      if (input.creditCardToken) {
        payload.creditCardToken = input.creditCardToken;
      } else if (input.creditCard) {
        payload.creditCard = input.creditCard;
        if (input.creditCardHolderInfo) {
          payload.creditCardHolderInfo = input.creditCardHolderInfo;
        }
      }

      const asaasSub = await this.asaasClient.post<any>('/v3/subscriptions', payload);

      await this.subscriptionRepository.update(subscription.id, {
        asaasSubscriptionId: asaasSub.id,
        status: asaasSub.status || 'ACTIVE',
        creditCardToken: asaasSub.creditCard?.creditCardToken ?? input.creditCardToken ?? null,
        creditCardBrand: asaasSub.creditCard?.creditCardBrand ?? null,
        creditCardLast4: asaasSub.creditCard?.creditCardNumber ?? null,
        failureReason: null,
      });

      await this.eventPublisher.publish(EVENT_PATTERNS.WEBHOOK_FORWARD_TO_CLIENT, {
        event: 'SUBSCRIPTION_CREATED',
        subscription: {
          id: subscription.id,
          asaasSubscriptionId: asaasSub.id,
          status: asaasSub.status || 'ACTIVE',
          value: subscription.value,
          cycle: subscription.cycle,
        },
      });

      this.logger.log(`Assinatura ${subscription.id} criada no Asaas: ${asaasSub.id}`);
    } catch (error: any) {
      this.logger.error(
        `Falha ao criar assinatura ${subscription.id}: ${error.message}`,
      );

      const isValidationError = error instanceof AsaasBadRequestException;
      await this.subscriptionRepository.updateStatus(
        subscription.id,
        'FAILED',
        error.message || 'Falha na emissão da assinatura',
      );

      await this.eventPublisher.publish(EVENT_PATTERNS.WEBHOOK_FORWARD_TO_CLIENT, {
        event: 'SUBSCRIPTION_FAILED',
        subscription: {
          id: subscription.id,
          status: 'FAILED',
          failureReason: error.message,
        },
      });

      if (!isValidationError) {
        throw error;
      }
    }
  }
}
