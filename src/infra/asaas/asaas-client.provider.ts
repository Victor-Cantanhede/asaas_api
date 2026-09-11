import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AsaasApiException,
  AsaasBadRequestException,
  AsaasGatewayException,
  AsaasUnauthorizedException,
} from './errors';

export interface AsaasRequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, any>;
}

@Injectable()
export class AsaasClientProvider {
  private readonly logger = new Logger(AsaasClientProvider.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    const environment = this.configService.get<string>(
      'ASAAS_ENVIRONMENT',
      'sandbox',
    );
    this.baseUrl =
      environment === 'production'
        ? 'https://api.asaas.com'
        : 'https://api-sandbox.asaas.com';
    this.apiKey = this.configService.get<string>('ASAAS_API_KEY', '');
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async get<T = any>(path: string, params?: Record<string, any>): Promise<T> {
    return this.request<T>('GET', path, { params });
  }

  async post<T = any>(path: string, body?: any): Promise<T> {
    return this.request<T>('POST', path, { body });
  }

  async put<T = any>(path: string, body?: any): Promise<T> {
    return this.request<T>('PUT', path, { body });
  }

  async delete<T = any>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  private async request<T = any>(
    method: string,
    path: string,
    options: { body?: any; params?: Record<string, any> } = {},
  ): Promise<T> {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${cleanPath}`);

    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const headers: Record<string, string> = {
      access_token: this.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (options.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await fetch(url.toString(), fetchOptions);
    } catch (networkError: any) {
      this.logger.error(
        `Erro de rede ao conectar com Asaas [${method} ${url.toString()}]: ${networkError.message}`,
      );
      throw new AsaasGatewayException(
        `Falha na comunicação com o gateway Asaas: ${networkError.message}`,
        502,
      );
    }

    let responseData: any = null;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        responseData = await response.json();
      } catch {
        responseData = null;
      }
    } else {
      try {
        responseData = await response.text();
      } catch {
        responseData = null;
      }
    }

    if (!response.ok) {
      this.handleHttpError(response.status, responseData, method, cleanPath);
    }

    return responseData as T;
  }

  private handleHttpError(
    status: number,
    data: any,
    method: string,
    path: string,
  ): never {
    const errorDetails =
      data && typeof data === 'object' && Array.isArray(data.errors)
        ? data.errors
        : [];

    const firstErrorDesc =
      errorDetails.length > 0 && errorDetails[0].description
        ? errorDetails[0].description
        : `Erro na API Asaas [${status}]`;

    this.logger.warn(
      `Asaas Error [${method} ${path}]: status=${status}, message="${firstErrorDesc}"`,
    );

    if (status === 400) {
      throw new AsaasBadRequestException(firstErrorDesc, errorDetails);
    }

    if (status === 401 || status === 403) {
      throw new AsaasUnauthorizedException(
        firstErrorDesc || 'Acesso não autorizado ao gateway Asaas',
      );
    }

    if (status >= 500) {
      throw new AsaasGatewayException(
        `Gateway Asaas indisponível [${status}]: ${firstErrorDesc}`,
        status,
      );
    }

    throw new AsaasApiException(
      `Erro inesperado na chamada ao Asaas: ${firstErrorDesc}`,
      status,
      errorDetails,
    );
  }
}
