import { Payment } from '@prisma/client';

export interface CreatePaymentData {
  customerId: string;
  billingType: string;
  value: number;
  dueDate?: Date | null;
  externalReference?: string | null;
  splitConfig?: string | null;
}

export interface IPaymentRepository {
  findById(id: string): Promise<Payment | null>;
  findByExternalReference(externalReference: string): Promise<Payment | null>;
  findByAsaasPaymentId(asaasPaymentId: string): Promise<Payment | null>;
  createInitial(data: CreatePaymentData): Promise<Payment>;
  update(id: string, data: Partial<Payment>): Promise<Payment>;
  updateStatus(id: string, status: string, failureReason?: string | null): Promise<Payment>;
}

export const PAYMENT_REPOSITORY_TOKEN = Symbol('IPaymentRepository');
