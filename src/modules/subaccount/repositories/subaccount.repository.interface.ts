import { Subaccount } from '@prisma/client';
import { CreateSubaccountDto } from '../dto/create-subaccount.dto';

export const SUBACCOUNT_REPOSITORY_TOKEN = Symbol('ISubaccountRepository');

export interface ISubaccountRepository {
  upsertInitial(dto: CreateSubaccountDto): Promise<Subaccount>;
  findById(id: string): Promise<Subaccount | null>;
  findByExternalId(externalId: string): Promise<Subaccount | null>;
  findByWalletId(walletId: string): Promise<Subaccount | null>;
  updateSynced(
    id: string,
    data: {
      asaasAccountId: string;
      walletId: string;
      escrowEnabled: boolean;
      escrowDaysToExpire?: number | null;
    },
  ): Promise<Subaccount>;
  updateStatus(
    id: string,
    status: string,
    failureReason?: string | null,
  ): Promise<Subaccount>;
}
