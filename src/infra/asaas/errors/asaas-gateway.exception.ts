import { AsaasApiException } from './asaas-api.exception';

export class AsaasGatewayException extends AsaasApiException {
  constructor(message = 'Erro de comunicação ou indisponibilidade no gateway Asaas', status = 502) {
    super(message, status);
    this.name = 'AsaasGatewayException';
  }
}
