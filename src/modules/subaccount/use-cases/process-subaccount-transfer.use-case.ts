import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  SUBACCOUNT_REPOSITORY_TOKEN,
  ISubaccountRepository,
} from '../repositories/subaccount.repository.interface';
import { AsaasClientProvider } from '../../../infra/asaas/asaas-client.provider';
import { AsaasBadRequestException } from '../../../infra/asaas/errors';
import {
  EVENT_PUBLISHER_TOKEN,
  IEventPublisher,
} from '../../../infra/messaging/contracts/event-publisher.interface';
import { EVENT_PATTERNS } from '../../../infra/messaging/messaging.constants';
import { CardEncryptionService } from '../../../infra/security/card-encryption.service';
import { CreateSubaccountTransferDto } from '../dto/create-subaccount-transfer.dto';

export interface ProcessSubaccountTransferInput {
  subaccountId: string;
  transferData: CreateSubaccountTransferDto;
}

@Injectable()
export class ProcessSubaccountTransferUseCase {
  private readonly logger = new Logger(ProcessSubaccountTransferUseCase.name);

  constructor(
    @Inject(SUBACCOUNT_REPOSITORY_TOKEN)
    private readonly subaccountRepository: ISubaccountRepository,
    private readonly asaasClient: AsaasClientProvider,
    @Inject(EVENT_PUBLISHER_TOKEN)
    private readonly eventPublisher: IEventPublisher,
    private readonly cardEncryptionService: CardEncryptionService,
  ) {}

  async execute(input: ProcessSubaccountTransferInput): Promise<any> {
    // Busca polimórfica: por UUID local ou externalId
    let subaccount = await this.subaccountRepository.findById(input.subaccountId);
    if (!subaccount) {
      subaccount = await this.subaccountRepository.findByExternalId(input.subaccountId);
    }

    if (!subaccount) {
      this.logger.warn(`Subconta "${input.subaccountId}" não encontrada para transferência.`);
      throw new AsaasBadRequestException(`Subconta "${input.subaccountId}" não localizada no sistema.`);
    }

    if (!subaccount.apiKey) {
      this.logger.error(
        `Subconta "${subaccount.externalId}" não possui chave de API registrada para operações de transferência.`,
      );
      throw new AsaasBadRequestException(
        `Subconta "${subaccount.externalId}" não possui credencial API registrada para emissão de saques pela conta mãe.`,
      );
    }

    let subaccountApiKey: string;
    try {
      subaccountApiKey = this.cardEncryptionService.isEncrypted(subaccount.apiKey)
        ? this.cardEncryptionService.decryptText(subaccount.apiKey)
        : subaccount.apiKey;
    } catch (decryptErr: any) {
      this.logger.error(`Falha ao descriptografar chave da subconta ${subaccount.id}: ${decryptErr.message}`);
      throw new AsaasBadRequestException('Falha na autenticação interna da credencial da subconta.');
    }

    try {
      const payload: Record<string, any> = {
        value: input.transferData.value,
      };

      if (input.transferData.pixAddressKey) {
        payload.pixAddressKey = input.transferData.pixAddressKey;
        if (input.transferData.pixAddressKeyType) {
          payload.pixAddressKeyType = input.transferData.pixAddressKeyType;
        }
      } else if (input.transferData.bankAccount) {
        payload.bankAccount = {
          bank: { code: input.transferData.bankAccount.bankCode },
          accountName: input.transferData.bankAccount.name,
          ownerName: input.transferData.bankAccount.name,
          ownerBirthDate: null,
          cpfCnpj: input.transferData.bankAccount.cpfCnpj.replace(/\D/g, ''),
          agency: input.transferData.bankAccount.agency,
          account: input.transferData.bankAccount.account,
          accountDigit: input.transferData.bankAccount.accountDigit,
          bankAccountType: input.transferData.bankAccount.bankAccountType,
        };
      } else {
        throw new AsaasBadRequestException(
          'É obrigatório informar uma chave PIX (pixAddressKey) ou dados bancários (bankAccount) para a transferência.',
        );
      }

      if (input.transferData.description) {
        payload.description = input.transferData.description;
      }

      this.logger.log(
        `Disparando transferência manual de R$ ${input.transferData.value.toFixed(2)} para subconta ${subaccount.externalId}`,
      );

      // Dispara POST /v3/transfers autenticado com a apiKey da subconta
      const asaasTransfer = await this.asaasClient.post<any>('/v3/transfers', payload, {
        customApiKey: subaccountApiKey,
      });

      // Notifica o backend consumidor sobre a criação da transferência
      await this.eventPublisher.publish(EVENT_PATTERNS.WEBHOOK_FORWARD_TO_CLIENT, {
        event: 'TRANSFER_CREATED',
        transfer: {
          id: asaasTransfer.id,
          subaccountId: subaccount.id,
          externalId: subaccount.externalId,
          value: asaasTransfer.value || input.transferData.value,
          status: asaasTransfer.status || 'PENDING',
          dateCreated: asaasTransfer.dateCreated || new Date().toISOString(),
          description: input.transferData.description,
        },
      });

      this.logger.log(
        `Transferência ${asaasTransfer.id} gerada com sucesso para subconta ${subaccount.externalId}. Status: ${asaasTransfer.status}`,
      );

      return asaasTransfer;
    } catch (error: any) {
      this.logger.error(
        `Erro ao processar transferência para subconta ${subaccount.externalId}: ${error.message}`,
      );

      const isValidationError = error instanceof AsaasBadRequestException;
      if (!isValidationError) {
        throw error;
      }
      throw error;
    }
  }
}
