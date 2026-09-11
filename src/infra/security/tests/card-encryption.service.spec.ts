import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CardEncryptionService } from '../card-encryption.service';
import { CreditCardDto } from '../../../modules/payment/dto/credit-card.dto';

describe('CardEncryptionService', () => {
  let service: CardEncryptionService;
  let configServiceMock: { get: jest.Mock };

  const sampleCard: CreditCardDto = {
    holderName: 'JOHN DOE',
    number: '4111111111111111',
    expiryMonth: '12',
    expiryYear: '2028',
    ccv: '123',
  };

  beforeEach(async () => {
    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'CARD_ENCRYPTION_KEY') return 'test_super_secret_encryption_key_32_bytes_long';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardEncryptionService,
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    service = module.get<CardEncryptionService>(CardEncryptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should encrypt credit card data into an AES-256-GCM envelope', () => {
    const encrypted = service.encrypt(sampleCard);

    expect(encrypted).toBeDefined();
    expect(typeof encrypted).toBe('string');
    // Ensure plaintext PAN and CCV are NOT in the envelope
    expect(encrypted).not.toContain(sampleCard.number);
    expect(encrypted).not.toContain(sampleCard.ccv);

    // Formato iv:authTag:ciphertext
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    expect(service.isEncrypted(encrypted)).toBe(true);
  });

  it('should decrypt an encrypted envelope back to the original credit card data', () => {
    const encrypted = service.encrypt(sampleCard);
    const decrypted = service.decrypt(encrypted);

    expect(decrypted).toEqual(sampleCard);
    expect(decrypted.number).toBe('4111111111111111');
    expect(decrypted.ccv).toBe('123');
    expect(decrypted.holderName).toBe('JOHN DOE');
  });

  it('should fail decryption if authTag or ciphertext is tampered with (integrity check)', () => {
    const encrypted = service.encrypt(sampleCard);
    const [iv, authTag] = encrypted.split(':');

    // Tamper with ciphertext
    const tamperedCiphertext = Buffer.from('tampered_data').toString('base64');
    const tamperedEnvelope = `${iv}:${authTag}:${tamperedCiphertext}`;

    expect(() => service.decrypt(tamperedEnvelope)).toThrow();
  });

  it('should fail decryption if format is invalid', () => {
    expect(() => service.decrypt('invalid_format')).toThrow(
      'Formato de envelope criptografado inválido',
    );
    expect(() => service.decrypt('')).toThrow(
      'Envelope criptografado de cartão não fornecido',
    );
  });

  it('should return empty string when encrypting null or undefined', () => {
    expect(service.encrypt(null as any)).toBe('');
    expect(service.encrypt(undefined as any)).toBe('');
  });

  it('should correctly evaluate isEncrypted', () => {
    expect(service.isEncrypted('')).toBe(false);
    expect(service.isEncrypted('something')).toBe(false);
    expect(service.isEncrypted('a:b')).toBe(false);
    expect(service.isEncrypted('a:b:c')).toBe(true);
  });
});
