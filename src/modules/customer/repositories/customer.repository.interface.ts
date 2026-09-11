import { Customer } from '@prisma/client';

export interface UpsertCustomerData {
  externalId: string;
  name: string;
  email: string;
  cpfCnpj?: string;
  phone?: string;
}

export interface ICustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findByExternalId(externalId: string): Promise<Customer | null>;
  findByAsaasCustomerId(asaasCustomerId: string): Promise<Customer | null>;
  upsertInitial(data: UpsertCustomerData): Promise<Customer>;
  updateStatus(id: string, status: string, failureReason?: string | null): Promise<Customer>;
  updateSynced(id: string, asaasCustomerId: string): Promise<Customer>;
}

export const CUSTOMER_REPOSITORY_TOKEN = Symbol('ICustomerRepository');
