import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  PAYMENT_REPOSITORY_TOKEN,
  IPaymentRepository,
} from '../repositories/payment.repository.interface';
import { AsaasClientProvider } from '../../../infra/asaas/asaas-client.provider';
import { AsaasBadRequestException } from '../../../infra/asaas/errors';
import {
  EVENT_PUBLISHER_TOKEN,
  IEventPublisher,
} from '../../../infra/messaging/contracts/event-publisher.interface';
import { EVENT_PATTERNS } from '../../../infra/messaging/messaging.constants';

export interface ProcessReleaseEscrowInput {
  paymentId: string;
}

@Injectable()
export class ProcessReleaseEscrowUseCase {
  private readonly logger = new Logger(ProcessReleaseEscrowUseCase.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY_TOKEN)
    private readonly paymentRepository: IPaymentRepository,
    private readonly asaasClient: AsaasClientProvider,
    @Inject(EVENT_PUBLISHER_TOKEN)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(input: ProcessReleaseEscrowInput): Promise<void> {
    // Busca polimórfica: por UUID local ou por externalReference
    let payment = await this.paymentRepository.findById(input.paymentId);
    if (!payment) {
      payment = await this.paymentRepository.findByExternalReference(input.paymentId);
    }

    if (!payment) {
      this.logger.warn(
        `Pagamento "${input.paymentId}" não localizado para liberação de garantia (Escrow).`,
      );
      return;
    }

    if (!payment.asaasPaymentId) {
      this.logger.error(
        `Pagamento ${payment.id} ainda não possui identificador Asaas (asaasPaymentId).`,
      );
      return;
    }

    try {
      this.logger.log(
        `Encerrando garantia da cobrança Asaas ${payment.asaasPaymentId} (Pagamento: ${payment.id})`,
      );

      let finishDate = new Date();
      let escrowId: string | null = null;

      // 1. Consulta dados da garantia associada à cobrança no Asaas
      try {
        const escrowInfo = await this.asaasClient.get<any>(
          `/v3/payments/${payment.asaasPaymentId}/escrow`,
        );

        if (escrowInfo?.id) {
          escrowId = escrowInfo.id;
        }

        if (escrowInfo?.status === 'FINISHED' && escrowInfo?.finishDate) {
          finishDate = new Date(escrowInfo.finishDate);
        }
      } catch (getErr: any) {
        this.logger.debug(
          `Consulta preliminar da garantia em /escrow retornou: ${getErr.message}`,
        );
      }

      // 2. Chamada oficial Asaas para finalizar garantia (POST /v3/escrow/{id}/finish)
      if (escrowId) {
        const finishResult = await this.asaasClient.post<any>(
          `/v3/escrow/${escrowId}/finish`,
          {},
        );
        if (finishResult?.finishDate) {
          finishDate = new Date(finishResult.finishDate);
        }
      } else {
        // Fallback direto por cobrança caso o ID da garantia não tenha sido obtido
        const finishResult = await this.asaasClient.post<any>(
          `/v3/payments/${payment.asaasPaymentId}/escrow`,
          {},
        );
        if (finishResult?.finishDate) {
          finishDate = new Date(finishResult.finishDate);
        }
      }

      await this.paymentRepository.update(payment.id, {
        escrowStatus: 'FINISHED',
        escrowFinishDate: finishDate,
      });

      await this.eventPublisher.publish(EVENT_PATTERNS.WEBHOOK_FORWARD_TO_CLIENT, {
        event: 'ESCROW_RELEASED',
        payment: {
          id: payment.id,
          externalReference: payment.externalReference,
          asaasPaymentId: payment.asaasPaymentId,
          escrowStatus: 'FINISHED',
          finishDate: finishDate.toISOString(),
        },
      });

      this.logger.log(
        `Garantia Escrow do pagamento ${payment.id} encerrada com sucesso. Valores liberados na subconta.`,
      );
    } catch (error: any) {
      this.logger.error(
        `Falha ao liberar garantia Escrow para ${payment.id}: ${error.message}`,
      );

      const isValidationError = error instanceof AsaasBadRequestException;

      if (!isValidationError) {
        throw error;
      }
    }
  }
}
