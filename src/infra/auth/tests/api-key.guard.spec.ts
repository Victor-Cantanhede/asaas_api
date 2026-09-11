import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from '../api-key.guard';
import { ApiScope } from '../scopes.decorator';

describe('ApiKeyGuard (RBAC & Timing Protection)', () => {
  let guard: ApiKeyGuard;
  let configServiceMock: jest.Mocked<Partial<ConfigService>>;
  let reflectorMock: jest.Mocked<Partial<Reflector>>;

  beforeEach(() => {
    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'API_KEY') return 'secret_admin_key_123';
        if (key === 'API_KEY_READ') return 'secret_read_key_456';
        if (key === 'API_KEY_PAYMENTS') return 'secret_payments_key_789';
        return undefined;
      }),
    };

    reflectorMock = {
      getAllAndOverride: jest.fn(),
    };

    guard = new ApiKeyGuard(
      configServiceMock as ConfigService,
      reflectorMock as Reflector,
    );
  });

  function createMockContext(
    headers: Record<string, string>,
    method: string = 'GET',
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          method,
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  }

  describe('Autenticação Básica e Timing Protection', () => {
    it('deve permitir acesso irrestrito quando chave de ADMIN é fornecida', () => {
      const context = createMockContext(
        { 'x-api-key': 'secret_admin_key_123' },
        'POST',
      );
      expect(guard.canActivate(context)).toBe(true);
    });

    it('deve lançar UnauthorizedException quando x-api-key não for informada', () => {
      const context = createMockContext({});
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow(
        'Chave de API (x-api-key) inválida ou não informada',
      );
    });

    it('deve lançar UnauthorizedException quando x-api-key estiver incorreta (comprimento diferente)', () => {
      const context = createMockContext({ 'x-api-key': 'wrong_key' });
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('deve lançar UnauthorizedException quando x-api-key estiver incorreta (mesmo comprimento, bytes divergentes)', () => {
      const context = createMockContext({ 'x-api-key': 'secret_admin_key_999' });
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('deve lançar UnauthorizedException quando nenhuma chave estiver configurada no ConfigService', () => {
      configServiceMock.get = jest.fn().mockReturnValue(undefined);
      const context = createMockContext({ 'x-api-key': 'secret_admin_key_123' });
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  describe('RBAC - Restrição de Chaves Somente Leitura (read-only)', () => {
    it('deve permitir que chave de leitura (API_KEY_READ) acesse rota GET', () => {
      reflectorMock.getAllAndOverride = jest.fn().mockReturnValue([ApiScope.READ]);
      const context = createMockContext(
        { 'x-api-key': 'secret_read_key_456' },
        'GET',
      );
      expect(guard.canActivate(context)).toBe(true);
    });

    it('deve BLOQUEAR com ForbiddenException quando chave de leitura tentar rota POST (escrita)', () => {
      reflectorMock.getAllAndOverride = jest
        .fn()
        .mockReturnValue([ApiScope.WRITE, ApiScope.ADMIN]);
      const context = createMockContext(
        { 'x-api-key': 'secret_read_key_456' },
        'POST',
      );

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'Chave de API não possui permissão para esta operação',
      );
    });

    it('deve BLOQUEAR com ForbiddenException quando chave de leitura tentar rota DELETE (deleção)', () => {
      reflectorMock.getAllAndOverride = jest.fn().mockReturnValue([ApiScope.ADMIN]);
      const context = createMockContext(
        { 'x-api-key': 'secret_read_key_456' },
        'DELETE',
      );

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'Chave de API não possui permissão para esta operação',
      );
    });

    it('deve BLOQUEAR com ForbiddenException quando chave de leitura tentar rota PUT via fallback de método', () => {
      reflectorMock.getAllAndOverride = jest.fn().mockReturnValue(undefined);
      const context = createMockContext(
        { 'x-api-key': 'secret_read_key_456' },
        'PUT',
      );

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('RBAC - Chave de Pagamentos (payments)', () => {
    it('deve permitir que chave de pagamentos realize operações POST de pagamento', () => {
      reflectorMock.getAllAndOverride = jest
        .fn()
        .mockReturnValue([ApiScope.PAYMENTS, ApiScope.WRITE, ApiScope.ADMIN]);
      const context = createMockContext(
        { 'x-api-key': 'secret_payments_key_789' },
        'POST',
      );

      expect(guard.canActivate(context)).toBe(true);
    });

    it('deve bloquear chave de pagamentos de realizar operações exclusivas de ADMIN (ex: DELETE)', () => {
      reflectorMock.getAllAndOverride = jest.fn().mockReturnValue([ApiScope.ADMIN]);
      const context = createMockContext(
        { 'x-api-key': 'secret_payments_key_789' },
        'DELETE',
      );

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('RBAC - Chaves Customizadas via API_KEYS_CONFIG', () => {
    it('deve carregar chaves definidas em JSON customizado', () => {
      configServiceMock.get = jest.fn((key: string) => {
        if (key === 'API_KEYS_CONFIG') {
          return JSON.stringify([
            {
              key: 'custom_operator_key_999',
              scopes: [ApiScope.PAYMENTS],
              name: 'operator-key',
            },
          ]);
        }
        return undefined;
      });

      reflectorMock.getAllAndOverride = jest
        .fn()
        .mockReturnValue([ApiScope.PAYMENTS]);

      const context = createMockContext(
        { 'x-api-key': 'custom_operator_key_999' },
        'POST',
      );

      expect(guard.canActivate(context)).toBe(true);
    });
  });
});
