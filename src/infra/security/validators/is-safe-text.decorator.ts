import {
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import { containsHtmlOrScript } from '../sanitization.utils';

/**
 * Validador customizado para class-validator que rejeita strings contendo tags HTML,
 * scripts (<script>) ou caracteres perigosos como < e >, prevenindo Stored XSS.
 */
export function IsSafeText(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSafeText',
      target: object.constructor,
      propertyName: propertyName,
      options: {
        message:
          validationOptions?.message ||
          'O campo $property não pode conter tags HTML, scripts ou caracteres perigosos (< ou >).',
        ...validationOptions,
      },
      validator: {
        validate(value: any) {
          if (value === null || value === undefined) {
            return true;
          }
          if (typeof value !== 'string') {
            return false;
          }
          return !containsHtmlOrScript(value);
        },
      },
    });
  };
}
