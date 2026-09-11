import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';
import { ApiScope, SCOPES_KEY } from './scopes.decorator';

export interface KeyConfig {
  key: string;
  scopes: ApiScope[];
  name: string;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly reflector?: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKeyHeader = request.headers['x-api-key'];

    if (!apiKeyHeader || typeof apiKeyHeader !== 'string') {
      throw new UnauthorizedException(
        'Chave de API (x-api-key) inválida ou não informada',
      );
    }

    const configuredKeys = this.getConfiguredKeys();
    if (configuredKeys.length === 0) {
      throw new UnauthorizedException(
        'Chave de API (x-api-key) inválida ou não informada',
      );
    }

    const matchedKey = this.findMatchingKey(apiKeyHeader, configuredKeys);
    if (!matchedKey) {
      throw new UnauthorizedException(
        'Chave de API (x-api-key) inválida ou não informada',
      );
    }

    // Anexa contexto da chave autenticada para auditoria interna
    request.apiKey = {
      name: matchedKey.name,
      scopes: matchedKey.scopes,
    };

    // Chave com privilégio de administrador possui acesso irrestrito
    if (matchedKey.scopes.includes(ApiScope.ADMIN)) {
      return true;
    }

    // Resolução dos escopos exigidos pelo endpoint
    const requiredScopes = this.resolveRequiredScopes(context, request);

    // Verifica se a chave possui pelo menos um dos escopos necessários
    const hasPermission = requiredScopes.some((scope) =>
      matchedKey.scopes.includes(scope),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Chave de API não possui permissão para esta operação. Escopos necessários: [${requiredScopes.join(
          ', ',
        )}]. Escopos da chave: [${matchedKey.scopes.join(', ')}]`,
      );
    }

    return true;
  }

  private getConfiguredKeys(): KeyConfig[] {
    const keys: KeyConfig[] = [];

    // Chave Principal (Admin com acesso completo)
    const primaryKey = this.configService.get<string>('API_KEY');
    if (primaryKey) {
      keys.push({
        key: primaryKey,
        scopes: [
          ApiScope.ADMIN,
          ApiScope.WRITE,
          ApiScope.PAYMENTS,
          ApiScope.READ,
        ],
        name: 'primary-admin-key',
      });
    }

    // Chave Somente Leitura (Restrita a GET e consultas)
    const readKey = this.configService.get<string>('API_KEY_READ');
    if (readKey) {
      keys.push({
        key: readKey,
        scopes: [ApiScope.READ],
        name: 'read-only-key',
      });
    }

    // Chave Específica de Pagamentos (Operações de cobrança e consulta)
    const paymentsKey = this.configService.get<string>('API_KEY_PAYMENTS');
    if (paymentsKey) {
      keys.push({
        key: paymentsKey,
        scopes: [ApiScope.PAYMENTS, ApiScope.READ],
        name: 'payments-key',
      });
    }

    // Suporte a chaves customizadas adicionais via JSON
    const customConfig = this.configService.get<string>('API_KEYS_CONFIG');
    if (customConfig) {
      try {
        const parsed = JSON.parse(customConfig);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item.key && Array.isArray(item.scopes)) {
              keys.push({
                key: item.key,
                scopes: item.scopes,
                name: item.name || 'custom-key',
              });
            }
          }
        }
      } catch {
        // Ignora JSON de configuração malformatado
      }
    }

    return keys;
  }

  private findMatchingKey(
    inputKey: string,
    configuredKeys: KeyConfig[],
  ): KeyConfig | null {
    const inputBuffer = Buffer.from(inputKey);

    for (const keyConfig of configuredKeys) {
      const secretBuffer = Buffer.from(keyConfig.key);
      if (
        inputBuffer.length === secretBuffer.length &&
        timingSafeEqual(inputBuffer, secretBuffer)
      ) {
        return keyConfig;
      }
    }

    return null;
  }

  private resolveRequiredScopes(
    context: ExecutionContext,
    request: any,
  ): ApiScope[] {
    if (this.reflector) {
      const declaredScopes = this.reflector.getAllAndOverride<ApiScope[]>(
        SCOPES_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (declaredScopes && declaredScopes.length > 0) {
        return declaredScopes;
      }
    }

    // Fallback baseado no método HTTP (Princípio do Menor Privilégio)
    const method = (request.method || '').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return [ApiScope.READ];
    }
    if (method === 'DELETE') {
      return [ApiScope.ADMIN];
    }

    // POST, PUT, PATCH
    return [ApiScope.WRITE];
  }
}
