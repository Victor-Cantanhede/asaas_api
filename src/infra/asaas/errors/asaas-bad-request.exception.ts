import { AsaasApiException } from './asaas-api.exception';

export class AsaasBadRequestException extends AsaasApiException {
  constructor(message: string, errors: any[] = []) {
    super(message, 400, errors);
    this.name = 'AsaasBadRequestException';
  }
}
