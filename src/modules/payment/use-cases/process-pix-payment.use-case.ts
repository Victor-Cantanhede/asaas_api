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

export interface ProcessPixPaymentInput {
  paymentId: string;
}

@Injectable()
export class ProcessPixPaymentUseCase {
  private readonly logger = new Logger(ProcessPixPaymentUseCase.name);

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

  async execute(input: ProcessPixPaymentInput): Promise<void> {
    const payment = await this.paymentRepository.findById(input.paymentId);
    if (!payment) {
      this.logger.warn(`Pagamento ${input.paymentId} não encontrado.`);
      return;
    }

    let customer = await this.customerRepository.findById(payment.customerId);
    if (!customer) {
      this.logger.error(`Cliente associado ${payment.customerId} não encontrado.`);
      await this.paymentRepository.updateStatus(
        payment.id,
        'FAILED',
        'Cliente associado ao pagamento não localizado',
      );
      return;
    }

    // Se o cliente ainda não foi sincronizado com o Asaas, sincroniza agora
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
        'Não foi possível obter o identificador Asaas do cliente',
      );
      return;
    }

    try {
      // 1. Prepara vencimento (D+1 se omitido)
      const dueDateStr = payment.dueDate
        ? payment.dueDate.toISOString().split('T')[0]
        : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // 2. Monta payload para o Asaas
      const payload: Record<string, any> = {
        customer: customer.asaasCustomerId,
        billingType: 'PIX',
        value: payment.value,
        dueDate: dueDateStr,
      };

      if (payment.externalReference) {
        payload.externalReference = payment.externalReference;
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
          this.logger.warn(`Erro ao parsear splitConfig para pagamento ${payment.id}`);
        }
      }

      // 3. Cria cobrança PIX no Asaas
      const asaasPayment = await this.asaasClient.post<any>('/v3/payments', payload);

      // 4. Obtém o QR Code e Copia-e-Cola
      let pixQrCodeBase64: string | null = null;
      let pixPayload: string | null = null;
      let pixExpirationDate: Date | null = null;

      try {
        const qrCodeData = await this.asaasClient.get<any>(
          `/v3/payments/${asaasPayment.id}/pixQrCode`,
        );
        pixQrCodeBase64 = qrCodeData.encodedImage ?? null;
        pixPayload = qrCodeData.payload ?? null;
        pixExpirationDate = qrCodeData.expirationDate
          ? new Date(qrCodeData.expirationDate)
          : null;
      } catch (qrError: any) {
        this.logger.warn(
          `Falha transitória ao buscar QR Code para ${asaasPayment.id}: ${qrError.message}`,
        );
      }

      const escrowStatus =
        asaasPayment.escrow?.status ??
        (payment.splitConfig ? 'ACTIVE' : 'NONE');

      // 5. Atualiza o pagamento local com dados completos
      await this.paymentRepository.update(payment.id, {
        asaasPaymentId: asaasPayment.id,
        status: asaasPayment.status || 'PENDING',
        netValue: asaasPayment.netValue ?? null,
        invoiceUrl: asaasPayment.invoiceUrl ?? null,
        pixQrCodeBase64,
        pixPayload,
        pixExpirationDate,
        escrowStatus,
        failureReason: null,
      });

      // 6. Notifica emissão bem-sucedida para eventual repasse
      await this.eventPublisher.publish(EVENT_PATTERNS.WEBHOOK_FORWARD_TO_CLIENT, {
        event: 'PAYMENT_CREATED',
        payment: {
          id: payment.id,
          asaasPaymentId: asaasPayment.id,
          status: asaasPayment.status || 'PENDING',
          value: payment.value,
          billingType: 'PIX',
          externalReference: payment.externalReference,
          pixPayload,
          escrowStatus,
        },
      });

      this.logger.log(`Cobrança PIX ${payment.id} processada com sucesso no Asaas.`);
    } catch (error: any) {
      this.logger.error(`Erro ao criar cobrança PIX ${payment.id}: ${error.message}`);

      const isValidationError = error instanceof AsaasBadRequestException;
      await this.paymentRepository.updateStatus(
        payment.id,
        'FAILED',
        error.message || 'Falha na comunicação com gateway Asaas',
      );

      if (!isValidationError) {
        throw error;
      }
    }
  }
}
