import { Injectable } from '@nestjs/common';
import { Subaccount } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { CreateSubaccountDto } from '../dto/create-subaccount.dto';
import { ISubaccountRepository } from './subaccount.repository.interface';

@Injectable()
export class PrismaSubaccountRepository implements ISubaccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertInitial(dto: CreateSubaccountDto): Promise<Subaccount> {
    return this.prisma.subaccount.upsert({
      where: { externalId: dto.externalId },
      update: {
        name: dto.name,
        email: dto.email,
        cpfCnpj: dto.cpfCnpj,
        phone: dto.phone ?? null,
        mobilePhone: dto.mobilePhone ?? null,
        incomeValue: dto.incomeValue ?? null,
        address: dto.address ?? null,
        addressNumber: dto.addressNumber ?? null,
        province: dto.province ?? null,
        postalCode: dto.postalCode ?? null,
        companyType: dto.companyType ?? null,
        escrowEnabled: dto.escrow?.enabled ?? false,
        escrowDaysToExpire: dto.escrow?.daysToExpire ?? null,
        status: 'RECEIVED',
        failureReason: null,
      },
      create: {
        externalId: dto.externalId,
        name: dto.name,
        email: dto.email,
        cpfCnpj: dto.cpfCnpj,
        phone: dto.phone ?? null,
        mobilePhone: dto.mobilePhone ?? null,
        incomeValue: dto.incomeValue ?? null,
        address: dto.address ?? null,
        addressNumber: dto.addressNumber ?? null,
        province: dto.province ?? null,
        postalCode: dto.postalCode ?? null,
        companyType: dto.companyType ?? null,
        escrowEnabled: dto.escrow?.enabled ?? false,
        escrowDaysToExpire: dto.escrow?.daysToExpire ?? null,
        status: 'RECEIVED',
      },
    });
  }

  async findById(id: string): Promise<Subaccount | null> {
    return this.prisma.subaccount.findUnique({
      where: { id },
    });
  }

  async findByExternalId(externalId: string): Promise<Subaccount | null> {
    return this.prisma.subaccount.findUnique({
      where: { externalId },
    });
  }

  async findByWalletId(walletId: string): Promise<Subaccount | null> {
    return this.prisma.subaccount.findUnique({
      where: { walletId },
    });
  }

  async updateSynced(
    id: string,
    data: {
      asaasAccountId: string;
      walletId: string;
      escrowEnabled: boolean;
      escrowDaysToExpire?: number | null;
    },
  ): Promise<Subaccount> {
    return this.prisma.subaccount.update({
      where: { id },
      data: {
        asaasAccountId: data.asaasAccountId,
        walletId: data.walletId,
        escrowEnabled: data.escrowEnabled,
        escrowDaysToExpire: data.escrowDaysToExpire ?? null,
        status: 'SYNCED',
        failureReason: null,
      },
    });
  }

  async updateStatus(
    id: string,
    status: string,
    failureReason?: string | null,
  ): Promise<Subaccount> {
    return this.prisma.subaccount.update({
      where: { id },
      data: {
        status,
        failureReason: failureReason ?? null,
      },
    });
  }
}
