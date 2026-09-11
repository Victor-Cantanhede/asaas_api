import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  CUSTOMER_REPOSITORY_TOKEN,
  ICustomerRepository,
} from '../repositories/customer.repository.interface';
import { AsaasClientProvider } from '../../../infra/asaas/asaas-client.provider';
import { AsaasBadRequestException } from '../../../infra/asaas/errors';

export interface SyncCustomerInput {
  customerId: string;
  externalId: string;
}

@Injectable()
export class SyncCustomerUseCase {
  private readonly logger = new Logger(SyncCustomerUseCase.name);

  constructor(
    @Inject(CUSTOMER_REPOSITORY_TOKEN)
    private readonly customerRepository: ICustomerRepository,
    private readonly asaasClient: AsaasClientProvider,
  ) {}

  async execute(input: SyncCustomerInput): Promise<void> {
    const customer = await this.customerRepository.findById(input.customerId);
    if (!customer) {
      this.logger.warn(`Cliente ${input.customerId} não encontrado para sincronização`);
      return;
    }

    try {
      let asaasCustomerId: string | null = customer.asaasCustomerId;

      // 1. Se ainda não temos o asaasCustomerId, verifica no Asaas por externalReference
      if (!asaasCustomerId) {
        const searchResult = await this.asaasClient.get<{ data: any[] }>('/v3/customers', {
          externalReference: customer.externalId,
        });

        if (searchResult?.data && searchResult.data.length > 0) {
          asaasCustomerId = searchResult.data[0].id;
        }
      }

      // 2. Se não encontrou por externalReference e possui cpfCnpj, busca por cpfCnpj
      if (!asaasCustomerId && customer.cpfCnpj) {
        const searchByCpf = await this.asaasClient.get<{ data: any[] }>('/v3/customers', {
          cpfCnpj: customer.cpfCnpj,
        });

        if (searchByCpf?.data && searchByCpf.data.length > 0) {
          asaasCustomerId = searchByCpf.data[0].id;
        }
      }

      // 3. Se ainda não existe no Asaas, cria novo cliente
      if (!asaasCustomerId) {
        const createPayload: Record<string, any> = {
          name: customer.name,
          email: customer.email,
          externalReference: customer.externalId,
        };

        if (customer.cpfCnpj) createPayload.cpfCnpj = customer.cpfCnpj;
        if (customer.phone) createPayload.phone = customer.phone;

        const createResult = await this.asaasClient.post<any>('/v3/customers', createPayload);
        asaasCustomerId = createResult.id;
      }

      // 4. Salva a sincronização com sucesso no PostgreSQL
      await this.customerRepository.updateSynced(customer.id, asaasCustomerId!);
      this.logger.log(
        `Cliente ${customer.externalId} sincronizado com sucesso no Asaas: ${asaasCustomerId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Falha ao sincronizar cliente ${customer.externalId}: ${error.message}`,
      );

      const isValidationError = error instanceof AsaasBadRequestException;
      await this.customerRepository.updateStatus(
        customer.id,
        'FAILED',
        error.message || 'Erro desconhecido na integração Asaas',
      );

      // Se for erro permanente de validação do Asaas, não retenta (não propaga)
      // Se for transitório (502 / rede), propaga para requeue no RabbitMQ
      if (!isValidationError) {
        throw error;
      }
    }
  }
}
