export const RMQ_CLIENT_TOKEN = 'RABBITMQ_CLIENT';

export const QUEUES = {
  MAIN: 'asaas_main_queue',
  DLQ: 'asaas_dlq_queue',
} as const;

export const EVENT_PATTERNS = {
  CUSTOMER_SYNC: 'customer.sync',
  PAYMENT_CREATE_PIX: 'payment.create_pix',
  PAYMENT_CHARGE_CREDIT_CARD: 'payment.charge_credit_card',
  SUBSCRIPTION_CREATE: 'subscription.create',
  SUBSCRIPTION_UPDATE_CARD: 'subscription.update_card',
  SUBSCRIPTION_CANCEL: 'subscription.cancel',
  SUBACCOUNT_CREATE: 'subaccount.create',
  PAYMENT_RELEASE_ESCROW: 'payment.release_escrow',
  WEBHOOK_RECEIVED: 'webhook.received',
  WEBHOOK_FORWARD_TO_CLIENT: 'webhook.forward_to_client',
} as const;
