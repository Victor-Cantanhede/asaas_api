import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { CreditCardDto } from '../../modules/payment/dto/credit-card.dto';

@Injectable()
export class CardEncryptionService {
  private readonly logger = new Logger(CardEncryptionService.name);
  private readonly key: Buffer;
  private readonly algorithm = 'aes-256-gcm';

  constructor(private readonly configService: ConfigService) {
    const rawKey =
      this.configService.get<string>('CARD_ENCRYPTION_KEY') ||
      this.configService.get<string>('API_KEY') ||
      'asaas_api_secure_card_encryption_default_key_32bytes!';

    // Deriva uma chave criptográfica de 256 bits (32 bytes)
    this.key = createHash('sha256').update(rawKey).digest();
  }

  /**
   * Criptografa os dados sensíveis do cartão de crédito (PAN e CVV) usando AES-256-GCM.
   * Garante conformidade com os requisitos 3 e 4 do PCI-DSS para trânsito no broker de mensageria.
   * Formato retornado: iv:authTag:ciphertext (em Base64).
   */
  encrypt(card: CreditCardDto): string {
    if (!card) {
      return '';
    }

    // IV de 12 bytes (96 bits) recomendado pelo NIST para AES-GCM
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, this.key, iv);

    const plaintext = JSON.stringify(card);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag(); // 16 bytes (128 bits)

    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  /**
   * Descriptografa o envelope seguro contendo os dados do cartão de crédito.
   */
  decrypt(encryptedEnvelope: string): CreditCardDto {
    if (!encryptedEnvelope) {
      throw new Error('Envelope criptografado de cartão não fornecido');
    }

    const parts = encryptedEnvelope.split(':');
    if (parts.length !== 3) {
      throw new Error('Formato de envelope criptografado inválido (esperado iv:authTag:ciphertext)');
    }

    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const ciphertext = Buffer.from(parts[2], 'base64');

    const decipher = createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString('utf8')) as CreditCardDto;
  }

  /**
   * Verifica se uma string possui o padrão de envelope criptografado.
   */
  isEncrypted(value?: string): boolean {
    if (!value || typeof value !== 'string') return false;
    const parts = value.split(':');
    return parts.length === 3 && parts.every((part) => part.length > 0);
  }
}
