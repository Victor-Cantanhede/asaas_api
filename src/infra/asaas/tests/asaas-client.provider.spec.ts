import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AsaasClientProvider } from '../asaas-client.provider';
import {
  AsaasBadRequestException,
  AsaasGatewayException,
  AsaasUnauthorizedException,
} from '../errors';

describe('AsaasClientProvider', () => {
  let provider: AsaasClientProvider;
  let configServiceMock: jest.Mocked<Partial<ConfigService>>;
  let originalFetch: typeof global.fetch;

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(async () => {
    configServiceMock = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'ASAAS_ENVIRONMENT') return 'sandbox';
        if (key === 'ASAAS_API_KEY') return 'test_api_key_123';
        return defaultValue;
      }) as any,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AsaasClientProvider,
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    provider = module.get<AsaasClientProvider>(AsaasClientProvider);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  it('should set sandbox base URL when environment is sandbox', () => {
    expect(provider.getBaseUrl()).toBe('https://api-sandbox.asaas.com');
  });

  it('should set production base URL when environment is production', async () => {
    configServiceMock.get = jest.fn((key: string) => {
      if (key === 'ASAAS_ENVIRONMENT') return 'production';
      if (key === 'ASAAS_API_KEY') return 'prod_key';
      return null;
    }) as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AsaasClientProvider,
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    const prodProvider = module.get<AsaasClientProvider>(AsaasClientProvider);
    expect(prodProvider.getBaseUrl()).toBe('https://api.asaas.com');
  });

  it('should make GET request with access_token and query parameters', async () => {
    const mockResponseData = { data: [{ id: 'cus_1' }] };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: () => 'application/json',
      },
      json: async () => mockResponseData,
    } as any);

    const result = await provider.get('/v3/customers', {
      email: 'test@example.com',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOptions] = (global.fetch as jest.Mock).mock.calls[0];

    expect(calledUrl).toContain('https://api-sandbox.asaas.com/v3/customers');
    expect(calledUrl).toContain('email=test%40example.com');
    expect(calledOptions.method).toBe('GET');
    expect(calledOptions.headers.access_token).toBe('test_api_key_123');
    expect(result).toEqual(mockResponseData);
  });

  it('should make POST request with JSON body and access_token', async () => {
    const mockResponseData = { id: 'cus_123', name: 'John Doe' };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: () => 'application/json',
      },
      json: async () => mockResponseData,
    } as any);

    const payload = { name: 'John Doe', email: 'john@example.com' };
    const result = await provider.post('/v3/customers', payload);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOptions] = (global.fetch as jest.Mock).mock.calls[0];

    expect(calledUrl).toBe('https://api-sandbox.asaas.com/v3/customers');
    expect(calledOptions.method).toBe('POST');
    expect(calledOptions.headers['Content-Type']).toBe('application/json');
    expect(calledOptions.body).toBe(JSON.stringify(payload));
    expect(result).toEqual(mockResponseData);
  });

  it('should throw AsaasBadRequestException on HTTP 400 with errors array', async () => {
    const errorBody = {
      errors: [
        { code: 'invalid_cpf', description: 'O CPF informado é inválido' },
      ],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: {
        get: () => 'application/json',
      },
      json: async () => errorBody,
    } as any);

    await expect(provider.post('/v3/customers', {})).rejects.toThrow(
      AsaasBadRequestException,
    );
  });

  it('should throw AsaasUnauthorizedException on HTTP 401', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: {
        get: () => 'application/json',
      },
      json: async () => ({ errors: [{ description: 'Chave inválida' }] }),
    } as any);

    await expect(provider.get('/v3/customers')).rejects.toThrow(
      AsaasUnauthorizedException,
    );
  });

  it('should throw AsaasGatewayException on HTTP 500', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: {
        get: () => 'application/json',
      },
      json: async () => ({}),
    } as any);

    await expect(provider.get('/v3/customers')).rejects.toThrow(
      AsaasGatewayException,
    );
  });

  it('should throw AsaasGatewayException on network fetch failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Connection reset by peer'));

    await expect(provider.get('/v3/customers')).rejects.toThrow(
      AsaasGatewayException,
    );
  });
});
