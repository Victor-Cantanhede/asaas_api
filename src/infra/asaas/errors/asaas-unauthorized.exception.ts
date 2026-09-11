import { AsaasApiException } from './asaas-api.exception';

export class AsaasUnauthorizedException extends AsaasApiException {
  constructor(message = 'Chave de API do Asaas não autorizada ou inválida') {
    super(message, 401);
    this.name = 'AsaasUnauthorizedException';
  }
}
