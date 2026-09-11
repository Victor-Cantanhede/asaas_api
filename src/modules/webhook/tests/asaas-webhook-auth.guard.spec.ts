import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AsaasWebhookAuthGuard } from '../guards/asaas-webhook-auth.guard';

describe('AsaasWebhookAuthGuard', () => {
  let guard: AsaasWebhookAuthGuard;
  let configServiceMock: jest.Mocked<Partial<ConfigService>>;

  beforeEach(() => {
    configServiceMock = {
      get: jest.fn().mockReturnValue('webhook_super_secret_token_123'),
    };
    guard = new AsaasWebhookAuthGuard(configServiceMock as ConfigService);
  });

  function createMockContext(headers: Record<string, string>): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
        }),
      }),
    } as any;
  }

  it('should allow access when valid asaas-access-token header is provided', () => {
    const context = createMockContext({
      'asaas-access-token': 'webhook_super_secret_token_123',
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw UnauthorizedException when header is missing', () => {
    const context = createMockContext({});
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when header has different length', () => {
    const context = createMockContext({
      'asaas-access-token': 'short_token',
    });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when header content differs', () => {
    const context = createMockContext({
      'asaas-access-token': 'webhook_super_secret_token_999',
    });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
