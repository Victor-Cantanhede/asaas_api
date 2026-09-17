import { Injectable } from '@nestjs/common';
import { Payment } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import {
  CreatePaymentData,
  IPaymentRepository,
} from './payment.repository.interface';

@Injectable()
export class PrismaPaymentRepository implements IPaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({
      where: { id },
    });
  }

  async findByExternalReference(
    externalReference: string,
  ): Promise<Payment | null> {
    return this.prisma.payment.findFirst({
      where: { externalReference },
    });
  }

  async findByAsaasPaymentId(asaasPaymentId: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({
      where: { asaasPaymentId },
    });
  }

  async createInitial(data: CreatePaymentData): Promise<Payment> {
    return this.prisma.payment.create({
      data: {
        customerId: data.customerId,
        billingType: data.billingType,
        value: data.value,
        dueDate: data.dueDate,
        externalReference: data.externalReference,
        splitConfig: data.splitConfig,
        status: 'RECEIVED',
      },
    });
  }

  async update(id: string, data: Partial<Payment>): Promise<Payment> {
    return this.prisma.payment.update({
      where: { id },
      data,
    });
  }

  async updateStatus(
    id: string,
    status: string,
    failureReason?: string | null,
  ): Promise<Payment> {
    return this.prisma.payment.update({
      where: { id },
      data: {
        status,
        failureReason: failureReason ?? null,
      },
    });
  }
}
