import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import {
  PAYMENT_REPOSITORY_TOKEN,
  IPaymentRepository,
} from '../repositories/payment.repository.interface';
import {
  CUSTOMER_REPOSITORY_TOKEN,
  ICustomerRepository,
} from '../../customer/repositories/customer.repository.interface';
import {
  SUBACCOUNT_REPOSITORY_TOKEN,
  ISubaccountRepository,
} from '../../subaccount/repositories/subaccount.repository.interface';
import { SyncCustomerUseCase } from '../../customer/use-cases/sync-customer.use-case';
import { AsaasClientProvider } from '../../../infra/asaas/asaas-client.provider';
import { AsaasBadRequestException } from '../../../infra/asaas/errors';
import {
  EVENT_PUBLISHER_TOKEN,
  IEventPublisher,
} from '../../../infra/messaging/contracts/event-publisher.interface';
import { EVENT_PATTERNS } from '../../../infra/messaging/messaging.constants';
import { CreditCardDto } from '../dto/credit-card.dto';
import { CreditCardHolderInfoDto } from '../dto/credit-card-holder-info.dto';

export interface ProcessCreditCardPaymentInput {
  paymentId: string;
  remoteIp: string;
  installmentCount?: number;
  creditCard?: CreditCardDto;
  encryptedCreditCard?: string;
  creditCardHolderInfo?: CreditCardHolderInfoDto;
  creditCardToken?: string;
}

@Injectable()
export class ProcessCreditCardPaymentUseCase {
  private readonly logger = new Logger(ProcessCreditCardPaymentUseCase.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY_TOKEN)
    private readonly paymentRepository: IPaymentRepository,
    @Inject(CUSTOMER_REPOSITORY_TOKEN)
    private readonly customerRepository: ICustomerRepository,
    private readonly syncCustomerUseCase: SyncCustomerUseCase,
    private readonly asaasClient: AsaasClientProvider,
    @Inject(EVENT_PUBLISHER_TOKEN)
    private readonly eventPublisher: IEventPublisher,
    @Optional()
    @Inject(SUBACCOUNT_REPOSITORY_TOKEN)
    private readonly subaccountRepository?: ISubaccountRepository,
  ) {}

  async execute(input: ProcessCreditCardPaymentInput): Promise<void> {
    const payment = await this.paymentRepository.findById(input.paymentId);
    if (!payment) {
      this.logger.warn(`Pagamento ${input.paymentId} não localizado para débito.`);
      return;
    }

    let customer = await this.customerRepository.findById(payment.customerId);
    if (!customer) {
      this.logger.error(`Cliente ${payment.customerId} não encontrado.`);
      await this.paymentRepository.updateStatus(
        payment.id,
        'FAILED',
        'Cliente associado ao pagamento não localizado',
      );
      return;
    }

    if (!customer.asaasCustomerId) {
      await this.syncCustomerUseCase.execute({
        customerId: customer.id,
        externalId: customer.externalId,
      });
      customer = await this.customerRepository.findById(payment.customerId);
    }

    if (!customer?.asaasCustomerId) {
      await this.paymentRepository.updateStatus(
        payment.id,
        'FAILED',
        'Não foi possível sincronizar o cliente no Asaas',
      );
      return;
    }

    try {
      const dueDateStr = payment.dueDate
        ? payment.dueDate.toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      const payload: Record<string, any> = {
        customer: customer.asaasCustomerId,
        billingType: 'CREDIT_CARD',
        value: payment.value,
        dueDate: dueDateStr,
        remoteIp: input.remoteIp,
      };

      if (payment.externalReference) {
        payload.externalReference = payment.externalReference;
      }

      if (input.installmentCount && input.installmentCount > 1) {
        payload.installmentCount = input.installmentCount;
        payload.installmentValue = Number(
          (payment.value / input.installmentCount).toFixed(2),
        );
      }

      if (input.creditCardToken) {
        payload.creditCardToken = input.creditCardToken;
      } else if (input.creditCard) {
        payload.creditCard = input.creditCard;
        if (input.creditCardHolderInfo) {
          payload.creditCardHolderInfo = input.creditCardHolderInfo;
        }
      }

      // DX: Resolução de split por subaccountExternalId ou walletId
      if (payment.splitConfig) {
        try {
          const rawSplit = JSON.parse(payment.splitConfig);
          if (Array.isArray(rawSplit)) {
            const resolvedSplit = await Promise.all(
              rawSplit.map(async (item: any) => {
                let targetWalletId = item.walletId;
                if (
                  !targetWalletId &&
                  item.subaccountExternalId &&
                  this.subaccountRepository
                ) {
                  const subacc = await this.subaccountRepository.findByExternalId(
                    item.subaccountExternalId,
                  );
                  if (subacc?.walletId) {
                    targetWalletId = subacc.walletId;
                  }
                }
                const splitItem: any = { walletId: targetWalletId };
                if (item.fixedValue !== undefined) splitItem.fixedValue = item.fixedValue;
                if (item.percentualValue !== undefined)
                  splitItem.percentualValue = item.percentualValue;
                if (item.description !== undefined) splitItem.description = item.description;
                return splitItem;
              }),
            );
            payload.split = resolvedSplit;
          }
        } catch {
          this.logger.warn(`Split inválido no pagamento ${payment.id}`);
        }
      }

      const asaasPayment = await this.asaasClient.post<any>('/v3/payments', payload);

      const escrowStatus =
        asaasPayment.escrow?.status ??
        (payment.splitConfig ? 'ACTIVE' : 'NONE');

      await this.paymentRepository.update(payment.id, {
        asaasPaymentId: asaasPayment.id,
        status: asaasPayment.status || 'CONFIRMED',
        netValue: asaasPayment.netValue ?? null,
        invoiceUrl: asaasPayment.invoiceUrl ?? null,
        escrowStatus,
        creditCardToken:
          asaasPayment.creditCard?.creditCardToken ?? input.creditCardToken ?? null,
        creditCardBrand: asaasPayment.creditCard?.creditCardBrand ?? null,
        creditCardLast4: asaasPayment.creditCard?.creditCardNumber ?? null,
        failureReason: null,
      });

      await this.eventPublisher.publish(EVENT_PATTERNS.WEBHOOK_FORWARD_TO_CLIENT, {
        event: 'PAYMENT_CONFIRMED',
        payment: {
          id: payment.id,
          asaasPaymentId: asaasPayment.id,
          status: asaasPayment.status || 'CONFIRMED',
          value: payment.value,
          billingType: 'CREDIT_CARD',
          escrowStatus,
          creditCard: asaasPayment.creditCard,
        },
      });

      this.logger.log(`Cobrança de cartão ${payment.id} processada: ${asaasPayment.status}`);
    } catch (error: any) {
      this.logger.error(`Falha no débito do cartão para ${payment.id}: ${error.message}`);

      const isValidationError = error instanceof AsaasBadRequestException;
      await this.paymentRepository.updateStatus(
        payment.id,
        'FAILED',
        error.message || 'Cartão recusado ou dados inválidos',
      );

      await this.eventPublisher.publish(EVENT_PATTERNS.WEBHOOK_FORWARD_TO_CLIENT, {
        event: 'PAYMENT_FAILED',
        payment: {
          id: payment.id,
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
