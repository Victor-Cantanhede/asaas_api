import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  PAYMENT_REPOSITORY_TOKEN,
  IPaymentRepository,
} from '../repositories/payment.repository.interface';
import { PaymentDetailsResponseDto } from '../dto/payment-details-response.dto';

@Injectable()
export class GetPaymentUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY_TOKEN)
    private readonly paymentRepository: IPaymentRepository,
  ) {}

  async execute(id: string): Promise<PaymentDetailsResponseDto> {
    const payment = await this.paymentRepository.findById(id);

    if (!payment) {
      throw new NotFoundException(`Cobrança com ID "${id}" não encontrada`);
    }

    return {
      id: payment.id,
      customerId: payment.customerId,
      asaasPaymentId: payment.asaasPaymentId,
      billingType: payment.billingType,
      status: payment.status,
      value: payment.value,
      netValue: payment.netValue,
      dueDate: payment.dueDate,
      paymentDate: payment.paymentDate,
      invoiceUrl: payment.invoiceUrl,
      externalReference: payment.externalReference,
      pixQrCodeBase64: payment.pixQrCodeBase64,
      pixPayload: payment.pixPayload,
      pixExpirationDate: payment.pixExpirationDate,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }
}
