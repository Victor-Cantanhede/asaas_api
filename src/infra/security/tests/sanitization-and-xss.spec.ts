import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  escapeHtml,
  stripHtmlTags,
  containsHtmlOrScript,
} from '../sanitization.utils';
import { CreateOrGetCustomerDto } from '../../../modules/customer/dto/create-or-get-customer.dto';
import { CreatePixPaymentDto } from '../../../modules/payment/dto/create-pix-payment.dto';
import { CreateCreditCardPaymentDto } from '../../../modules/payment/dto/create-credit-card-payment.dto';
import { CreateSubscriptionDto } from '../../../modules/subscription/dto/create-subscription.dto';
import { SanitizeText } from '../decorators/sanitize-text.decorator';

class TestDtoWithSanitize {
  @SanitizeText()
  comment?: string;
}

describe('Sanitização e Proteção contra Stored XSS', () => {
  describe('sanitization.utils', () => {
    it('deve escapar caracteres HTML perigosos (&, <, >, ", \', /)', () => {
      const malicious = '<script>alert("XSS & attack")</script>';
      const escaped = escapeHtml(malicious);

      expect(escaped).not.toContain('<');
      expect(escaped).not.toContain('>');
      expect(escaped).toBe(
        '&lt;script&gt;alert(&quot;XSS &amp; attack&quot;)&lt;&#x2F;script&gt;',
      );
    });

    it('deve remover tags HTML completas com stripHtmlTags', () => {
      const malicious = 'Olá <b>Mundo</b>! <script>alert(1)</script>';
      const stripped = stripHtmlTags(malicious);

      expect(stripped).toBe('Olá Mundo! alert(1)');
      expect(stripped).not.toContain('<');
      expect(stripped).not.toContain('>');
    });

    it('deve detectar tags HTML e scripts maliciosos com containsHtmlOrScript', () => {
      expect(containsHtmlOrScript('<script>')).toBe(true);
      expect(containsHtmlOrScript('</script>')).toBe(true);
      expect(containsHtmlOrScript('<img src="x" onerror="alert(1)">')).toBe(true);
      expect(containsHtmlOrScript('javascript:alert(1)')).toBe(true);
      expect(containsHtmlOrScript('onload = alert(1)')).toBe(true);
      expect(containsHtmlOrScript('Texto limpo sem tags 123')).toBe(false);
      expect(containsHtmlOrScript('Pedido #2048 - 10/12/2026')).toBe(false);
      expect(containsHtmlOrScript('')).toBe(false);
      expect(containsHtmlOrScript(undefined)).toBe(false);
    });
  });

  describe('@SanitizeText decorator (class-transformer)', () => {
    it('deve escapar caracteres HTML automaticamente na transformação do DTO', () => {
      const plain = { comment: '<script>alert("teste")</script>' };
      const instance = plainToInstance(TestDtoWithSanitize, plain);

      expect(instance.comment).toBe(
        '&lt;script&gt;alert(&quot;teste&quot;)&lt;&#x2F;script&gt;',
      );
      expect(instance.comment).not.toContain('<');
      expect(instance.comment).not.toContain('>');
    });
  });

  describe('Validação de DTOs contra Stored XSS (@IsSafeText)', () => {
    it('CreateOrGetCustomerDto: deve REJEITAR payload com tag <script> no campo "name"', async () => {
      const dto = plainToInstance(CreateOrGetCustomerDto, {
        externalId: 'ext_123',
        name: '<script>alert("XSS")</script>',
        email: 'attacker@example.com',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);

      const nameError = errors.find((err) => err.property === 'name');
      expect(nameError).toBeDefined();
      expect(nameError?.constraints?.isSafeText).toContain(
        'O campo name não pode conter tags HTML, scripts ou caracteres perigosos',
      );
    });

    it('CreateOrGetCustomerDto: deve ACEITAR nome legítimo sem caracteres HTML', async () => {
      const dto = plainToInstance(CreateOrGetCustomerDto, {
        externalId: 'ext_123',
        name: 'John Doe & Companhia',
        email: 'john@example.com',
      });

      const errors = await validate(dto);
      const nameError = errors.find((err) => err.property === 'name');
      expect(nameError).toBeUndefined();
    });

    it('CreatePixPaymentDto: deve REJEITAR payload com script no campo "description"', async () => {
      const dto = plainToInstance(CreatePixPaymentDto, {
        customerId: 'cust_123',
        value: 100.0,
        description: 'Pagamento <script>window.location="http://evil.com"</script>',
      });

      const errors = await validate(dto);
      const descError = errors.find((err) => err.property === 'description');

      expect(descError).toBeDefined();
      expect(descError?.constraints?.isSafeText).toBeDefined();
    });

    it('CreatePixPaymentDto: deve ACEITAR descrição legítima sem scripts', async () => {
      const dto = plainToInstance(CreatePixPaymentDto, {
        customerId: 'cust_123',
        value: 100.0,
        description: 'Mensalidade Plano Pro #1042',
      });

      const errors = await validate(dto);
      const descError = errors.find((err) => err.property === 'description');
      expect(descError).toBeUndefined();
    });

    it('CreateCreditCardPaymentDto: deve REJEITAR injeção HTML no campo "description"', async () => {
      const dto = plainToInstance(CreateCreditCardPaymentDto, {
        customerId: 'cust_123',
        value: 200.0,
        remoteIp: '187.12.34.56',
        description: '<img src=x onerror=alert("xss")>',
      });

      const errors = await validate(dto);
      const descError = errors.find((err) => err.property === 'description');

      expect(descError).toBeDefined();
      expect(descError?.constraints?.isSafeText).toBeDefined();
    });

    it('CreateSubscriptionDto: deve REJEITAR tag <script> na "description"', async () => {
      const dto = plainToInstance(CreateSubscriptionDto, {
        customerId: 'cust_123',
        value: 49.9,
        cycle: 'MONTHLY',
        remoteIp: '187.12.34.56',
        description: '<script>evil()</script>',
      });

      const errors = await validate(dto);
      const descError = errors.find((err) => err.property === 'description');

      expect(descError).toBeDefined();
      expect(descError?.constraints?.isSafeText).toBeDefined();
    });
  });
});
