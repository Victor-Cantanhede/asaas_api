import { Injectable } from '@nestjs/common';
import { Subscription } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import {
  CreateSubscriptionData,
  ISubscriptionRepository,
} from './subscription.repository.interface';

@Injectable()
export class PrismaSubscriptionRepository implements ISubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Subscription | null> {
    return this.prisma.subscription.findUnique({
      where: { id },
    });
  }

  async findByAsaasSubscriptionId(
    asaasSubscriptionId: string,
  ): Promise<Subscription | null> {
    return this.prisma.subscription.findUnique({
      where: { asaasSubscriptionId },
    });
  }

  async createInitial(data: CreateSubscriptionData): Promise<Subscription> {
    return this.prisma.subscription.create({
      data: {
        customerId: data.customerId,
        billingType: data.billingType || 'CREDIT_CARD',
        cycle: data.cycle,
        value: data.value,
        nextDueDate: data.nextDueDate,
        externalReference: data.externalReference,
        status: 'RECEIVED',
      },
    });
  }

  async update(id: string, data: Partial<Subscription>): Promise<Subscription> {
    return this.prisma.subscription.update({
      where: { id },
      data,
    });
  }

  async updateStatus(
    id: string,
    status: string,
    failureReason?: string | null,
  ): Promise<Subscription> {
    return this.prisma.subscription.update({
      where: { id },
      data: {
        status,
        failureReason: failureReason ?? null,
      },
    });
  }
}
