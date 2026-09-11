import { registerAs } from '@nestjs/config';

export const asaasConfig = registerAs('asaas', () => ({
  apiKey: process.env.ASAAS_API_KEY || '',
  environment: process.env.ASAAS_ENVIRONMENT || 'sandbox',
  baseUrl:
    process.env.ASAAS_ENVIRONMENT === 'production'
      ? 'https://api.asaas.com'
      : 'https://api-sandbox.asaas.com',
  webhookSecret: process.env.ASAAS_WEBHOOK_SECRET || '',
}));
