export class AsaasApiException extends Error {
  public readonly status: number;
  public readonly errors?: any[];

  constructor(message: string, status = 500, errors?: any[]) {
    super(message);
    this.name = 'AsaasApiException';
    this.status = status;
    this.errors = errors;
  }
}
