import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  SUBACCOUNT_REPOSITORY_TOKEN,
  ISubaccountRepository,
} from '../repositories/subaccount.repository.interface';
import { SubaccountResponseDto } from '../dto/subaccount-response.dto';

@Injectable()
export class GetSubaccountByExternalIdUseCase {
  constructor(
    @Inject(SUBACCOUNT_REPOSITORY_TOKEN)
    private readonly subaccountRepository: ISubaccountRepository,
  ) {}

  async execute(externalId: string): Promise<SubaccountResponseDto> {
    const subaccount = await this.subaccountRepository.findByExternalId(externalId);

    if (!subaccount) {
      throw new NotFoundException(
        `Subconta com externalId "${externalId}" não encontrada no sistema local`,
      );
    }

    return {
      id: subaccount.id,
      externalId: subaccount.externalId,
      asaasAccountId: subaccount.asaasAccountId,
      walletId: subaccount.walletId,
      name: subaccount.name,
      email: subaccount.email,
      cpfCnpj: subaccount.cpfCnpj,
      escrowEnabled: subaccount.escrowEnabled,
      escrowDaysToExpire: subaccount.escrowDaysToExpire,
      status: subaccount.status,
      failureReason: subaccount.failureReason,
      createdAt: subaccount.createdAt.toISOString(),
      updatedAt: subaccount.updatedAt.toISOString(),
    };
  }
}
