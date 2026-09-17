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

export interface CreateSubaccountInput {
  subaccountId: string;
  externalId: string;
}

@Injectable()
export class CreateSubaccountUseCase {
  private readonly logger = new Logger(CreateSubaccountUseCase.name);

  constructor(
    @Inject(SUBACCOUNT_REPOSITORY_TOKEN)
    private readonly subaccountRepository: ISubaccountRepository,
    private readonly asaasClient: AsaasClientProvider,
    @Inject(EVENT_PUBLISHER_TOKEN)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(input: CreateSubaccountInput): Promise<void> {
    const subaccount = await this.subaccountRepository.findById(input.subaccountId);
    if (!subaccount) {
      this.logger.warn(`Subconta ${input.subaccountId} não encontrada para processamento.`);
      return;
    }

    try {
      let asaasAccountId = subaccount.asaasAccountId;
      let walletId = subaccount.walletId;

      const cleanCpfCnpj = subaccount.cpfCnpj.replace(/\D/g, '');

      // 1. Se ainda não possui IDs Asaas, verifica se a conta já existe por CPF/CNPJ
      if (!asaasAccountId || !walletId) {
        const searchResult = await this.asaasClient.get<{ data: any[] }>('/v3/accounts', {
          cpfCnpj: cleanCpfCnpj,
        });

        if (searchResult?.data && searchResult.data.length > 0) {
          const existing = searchResult.data[0];
          asaasAccountId = existing.id;
          walletId = existing.walletId;
        }
      }

      // 2. Se não existir no Asaas, cria nova subconta
      if (!asaasAccountId || !walletId) {
        const payload: Record<string, any> = {
          name: subaccount.name,
          email: subaccount.email,
          cpfCnpj: cleanCpfCnpj,
        };

        if (subaccount.phone) payload.phone = subaccount.phone;
        if (subaccount.mobilePhone) payload.mobilePhone = subaccount.mobilePhone;
        if (subaccount.incomeValue) payload.incomeValue = subaccount.incomeValue;
        if (subaccount.address) payload.address = subaccount.address;
        if (subaccount.addressNumber) payload.addressNumber = subaccount.addressNumber;
        if (subaccount.province) payload.province = subaccount.province;
        if (subaccount.postalCode) payload.postalCode = subaccount.postalCode.replace(/\D/g, '');
        if (subaccount.companyType) payload.companyType = subaccount.companyType;

        const createdAccount = await this.asaasClient.post<any>('/v3/accounts', payload);
        asaasAccountId = createdAccount.id;
        walletId = createdAccount.walletId;
      }

      // 3. Se Escrow estiver habilitado, configura garantia de custódia na subconta
      if (subaccount.escrowEnabled && asaasAccountId) {
        try {
          const escrowPayload: Record<string, any> = {
            enabled: true,
            daysToExpire: subaccount.escrowDaysToExpire ?? 30,
          };

          await this.asaasClient.post(`/v3/accounts/${asaasAccountId}/escrow`, escrowPayload);
          this.logger.log(`Conta Escrow ativada com sucesso para a subconta ${asaasAccountId}`);
        } catch (escrowError: any) {
          this.logger.warn(
            `Aviso ao ativar Escrow para subconta ${asaasAccountId}: ${escrowError.message}`,
          );
        }
      }

      // 4. Salva a subconta sincronizada no banco local
      await this.subaccountRepository.updateSynced(subaccount.id, {
        asaasAccountId: asaasAccountId!,
        walletId: walletId!,
        escrowEnabled: subaccount.escrowEnabled,
        escrowDaysToExpire: subaccount.escrowDaysToExpire,
      });

      // 5. Notifica o backend consumidor sobre a criação da subconta e emissão do walletId
      await this.eventPublisher.publish(EVENT_PATTERNS.WEBHOOK_FORWARD_TO_CLIENT, {
        event: 'SUBACCOUNT_CREATED',
        subaccount: {
          id: subaccount.id,
          externalId: subaccount.externalId,
          asaasAccountId,
          walletId,
          escrowEnabled: subaccount.escrowEnabled,
        },
      });

      this.logger.log(
        `Subconta ${subaccount.externalId} sincronizada com sucesso. WalletId: ${walletId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Falha ao provisionar subconta ${subaccount.externalId}: ${error.message}`,
      );

      const isValidationError = error instanceof AsaasBadRequestException;
      await this.subaccountRepository.updateStatus(
        subaccount.id,
        'FAILED',
        error.message || 'Falha na comunicação com gateway Asaas',
      );

      if (!isValidationError) {
        throw error;
      }
    }
  }
}
