import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  SUBSCRIPTION_REPOSITORY_TOKEN,
  ISubscriptionRepository,
} from '../repositories/subscription.repository.interface';
import { SubscriptionResponseDto } from '../dto/subscription-response.dto';

@Injectable()
export class GetSubscriptionUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY_TOKEN)
    private readonly subscriptionRepository: ISubscriptionRepository,
  ) {}

  async execute(id: string): Promise<SubscriptionResponseDto> {
    const subscription = await this.subscriptionRepository.findById(id);

    if (!subscription) {
      throw new NotFoundException(`Assinatura com ID "${id}" não encontrada`);
    }

    return {
      id: subscription.id,
      customerId: subscription.customerId,
      asaasSubscriptionId: subscription.asaasSubscriptionId,
      externalReference: subscription.externalReference,
      billingType: subscription.billingType,
      status: subscription.status,
      cycle: subscription.cycle,
      value: subscription.value,
      nextDueDate: subscription.nextDueDate,
      creditCardToken: subscription.creditCardToken,
      creditCardBrand: subscription.creditCardBrand,
      creditCardLast4: subscription.creditCardLast4,
      failureReason: subscription.failureReason,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  }
}
