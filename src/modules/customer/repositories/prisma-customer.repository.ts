import { Injectable } from '@nestjs/common';
import { Customer } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { ICustomerRepository, UpsertCustomerData } from './customer.repository.interface';

@Injectable()
export class PrismaCustomerRepository implements ICustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Customer | null> {
    return this.prisma.customer.findUnique({
      where: { id },
    });
  }

  async findByExternalId(externalId: string): Promise<Customer | null> {
    return this.prisma.customer.findUnique({
      where: { externalId },
    });
  }

  async findByAsaasCustomerId(asaasCustomerId: string): Promise<Customer | null> {
    return this.prisma.customer.findUnique({
      where: { asaasCustomerId },
    });
  }

  async upsertInitial(data: UpsertCustomerData): Promise<Customer> {
    return this.prisma.customer.upsert({
      where: { externalId: data.externalId },
      update: {
        name: data.name,
        email: data.email,
        cpfCnpj: data.cpfCnpj ?? null,
        phone: data.phone ?? null,
      },
      create: {
        externalId: data.externalId,
        name: data.name,
        email: data.email,
        cpfCnpj: data.cpfCnpj ?? null,
        phone: data.phone ?? null,
        status: 'RECEIVED',
      },
    });
  }

  async updateStatus(
    id: string,
    status: string,
    failureReason?: string | null,
  ): Promise<Customer> {
    return this.prisma.customer.update({
      where: { id },
      data: {
        status,
        failureReason: failureReason ?? null,
      },
    });
  }

  async updateSynced(id: string, asaasCustomerId: string): Promise<Customer> {
    return this.prisma.customer.update({
      where: { id },
      data: {
        asaasCustomerId,
        status: 'SYNCED',
        failureReason: null,
      },
    });
  }
}
