import {
  registerDecorator,
  ValidationOptions,
  isCreditCard,
} from 'class-validator';

/**
 * Cartões de teste oficiais do Asaas Sandbox:
 * - Aprovação: 4444 4444 4444 4444 (não passa no algoritmo de Luhn padrão)
 * - Recusa Mastercard: 5184 0197 4037 3151
 * - Recusa Visa: 4916 5613 5824 0741
 */
export const ASAAS_SANDBOX_TEST_CARDS = new Set([
  '4444444444444444',
  '5184019740373151',
  '4916561358240741',
]);

/**
 * Determina se o ambiente atual permite cartões de teste de sandbox.
 */
export function isSandboxEnvironment(): boolean {
  const asaasEnv = process.env.ASAAS_ENVIRONMENT?.trim().toLowerCase();
  const nodeEnv = (process.env.NODE_ENV || 'development').trim().toLowerCase();

  // Se ASAAS_ENVIRONMENT for explicitamente 'production', nunca é sandbox
  if (asaasEnv === 'production') {
    return false;
  }

  // Se NODE_ENV for 'production' e ASAAS_ENVIRONMENT não foi explicitamente setado como 'sandbox', trata como produção (fail-safe)
  if (nodeEnv === 'production' && asaasEnv !== 'sandbox') {
    return false;
  }

  // Se ASAAS_ENVIRONMENT for explicitamente 'sandbox', é sandbox
  if (asaasEnv === 'sandbox') {
    return true;
  }

  // Em desenvolvimento ou teste, assume sandbox caso ASAAS_ENVIRONMENT não seja production
  return nodeEnv !== 'production';
}

/**
 * Valida se um número de cartão é válido para o Asaas.
 * Em ambiente de sandbox, aceita os cartões de teste do Asaas (como 4444 4444 4444 4444).
 * Em ambiente de produção, exige validação estrita com algoritmo de Luhn.
 */
export function isAsaasCreditCardValid(
  value: any,
  isSandbox: boolean = isSandboxEnvironment(),
): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  // Remove espaços, hífens e pontos
  const sanitized = value.replace(/[\s.-]+/g, '');

  if (!/^\d{13,19}$/.test(sanitized)) {
    return false;
  }

  // No sandbox, aceita os cartões oficiais de homologação do Asaas
  if (isSandbox && ASAAS_SANDBOX_TEST_CARDS.has(sanitized)) {
    return true;
  }

  // Validação padrão da biblioteca (Luhn algorithm e bandeiras conhecidas)
  return isCreditCard(sanitized);
}

/**
 * Validador customizado para class-validator que valida números de cartão de crédito.
 * Suporta o algoritmo de Luhn padrão (produção) e os cartões de homologação do Asaas Sandbox
 * (como 4444 4444 4444 4444) em ambientes de sandbox/desenvolvimento.
 */
export function IsCreditCardOrSandbox(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCreditCardOrSandbox',
      target: object.constructor,
      propertyName: propertyName,
      options: {
        message:
          validationOptions?.message ||
          '$property must be a credit card',
        ...validationOptions,
      },
      validator: {
        validate(value: any) {
          return isAsaasCreditCardValid(value);
        },
      },
    });
  };
}
