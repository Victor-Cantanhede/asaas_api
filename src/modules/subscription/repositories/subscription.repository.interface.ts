import { Subscription } from '@prisma/client';

export interface CreateSubscriptionData {
  customerId: string;
  billingType?: string;
  cycle: string;
  value: number;
  nextDueDate?: Date | null;
  externalReference?: string | null;
}

export interface ISubscriptionRepository {
  findById(id: string): Promise<Subscription | null>;
  findByAsaasSubscriptionId(asaasSubscriptionId: string): Promise<Subscription | null>;
  createInitial(data: CreateSubscriptionData): Promise<Subscription>;
  update(id: string, data: Partial<Subscription>): Promise<Subscription>;
  updateStatus(id: string, status: string, failureReason?: string | null): Promise<Subscription>;
}

export const SUBSCRIPTION_REPOSITORY_TOKEN = Symbol('ISubscriptionRepository');
