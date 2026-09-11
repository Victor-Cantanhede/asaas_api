import { SetMetadata } from '@nestjs/common';

export enum ApiScope {
  READ = 'read',
  WRITE = 'write',
  PAYMENTS = 'payments',
  ADMIN = 'admin',
}

export const SCOPES_KEY = 'scopes';

/**
 * Decorator para definir escopos de permissão necessários (RBAC) para o endpoint.
 * Se múltiplos escopos forem informados, qualquer um dos escopos autorizados concede acesso.
 * Chaves com escopo ADMIN possuem acesso irrestrito.
 */
export const RequireScopes = (...scopes: ApiScope[]) =>
  SetMetadata(SCOPES_KEY, scopes);
