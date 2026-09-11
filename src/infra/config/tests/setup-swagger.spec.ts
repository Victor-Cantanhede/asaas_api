import { INestApplication } from '@nestjs/common';
import { setupSwagger } from '../../../setup-swagger';
import * as swagger from '@nestjs/swagger';

jest.mock('@nestjs/swagger', () => {
  const original = jest.requireActual('@nestjs/swagger');
  return {
    ...original,
    SwaggerModule: {
      createDocument: jest.fn().mockReturnValue({ openapi: '3.0.0' }),
      setup: jest.fn(),
    },
  };
});

describe('setupSwagger (Hardening & Proteção em Produção)', () => {
  let appMock: any;
  let configServiceMock: any;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    configServiceMock = {
      get: jest.fn(),
    };

    appMock = {
      get: jest.fn().mockReturnValue(configServiceMock),
      use: jest.fn(),
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('deve DESABILITAR o Swagger em ambiente de produção quando não houver credenciais', () => {
    configServiceMock.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'production';
      return undefined;
    });

    setupSwagger(appMock as INestApplication);

    expect(swagger.SwaggerModule.setup).not.toHaveBeenCalled();
    expect(appMock.use).not.toHaveBeenCalled();
  });

  it('deve HABILITAR o Swagger com proteção HTTP Basic Auth em produção quando credenciais forem fornecidas', () => {
    configServiceMock.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'production';
      if (key === 'SWAGGER_USER') return 'admin_swagger';
      if (key === 'SWAGGER_PASSWORD') return 'secure_swagger_pass';
      return undefined;
    });

    setupSwagger(appMock as INestApplication);

    // Middleware de basic auth deve ter sido registrado
    expect(appMock.use).toHaveBeenCalledTimes(1);
    expect(swagger.SwaggerModule.setup).toHaveBeenCalledWith(
      'docs',
      appMock,
      expect.anything(),
    );
  });

  it('deve habilitar Swagger normalmente em ambiente de desenvolvimento ou teste sem exigir basic auth por padrão', () => {
    configServiceMock.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'development';
      return undefined;
    });

    setupSwagger(appMock as INestApplication);

    expect(swagger.SwaggerModule.setup).toHaveBeenCalledWith(
      'docs',
      appMock,
      expect.anything(),
    );
    expect(appMock.use).not.toHaveBeenCalled();
  });
});
