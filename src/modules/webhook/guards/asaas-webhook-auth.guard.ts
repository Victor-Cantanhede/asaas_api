import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class AsaasWebhookAuthGuard implements CanActivate {
  private readonly logger = new Logger(AsaasWebhookAuthGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const tokenHeader = request.headers['asaas-access-token'];
    const configuredSecret = this.configService.get<string>(
      'ASAAS_WEBHOOK_SECRET',
    );

    if (!tokenHeader) {
      this.logger.warn(
        '[AsaasWebhookAuthGuard] Cabeçalho "asaas-access-token" ausente na requisição.',
      );
      throw new UnauthorizedException(
        'Token de webhook do Asaas (asaas-access-token) ausente ou não configurado',
      );
    }

    if (!configuredSecret) {
      this.logger.error(
        '[AsaasWebhookAuthGuard] Variável de ambiente ASAAS_WEBHOOK_SECRET não configurada no servidor. Bloqueando chamada.',
      );
      throw new UnauthorizedException(
        'Token de webhook do Asaas (asaas-access-token) ausente ou não configurado',
      );
    }

    const tokenBuffer = Buffer.from(String(tokenHeader));
    const secretBuffer = Buffer.from(configuredSecret);

    if (
      tokenBuffer.length !== secretBuffer.length ||
      !timingSafeEqual(tokenBuffer, secretBuffer)
    ) {
      this.logger.warn(
        '[AsaasWebhookAuthGuard] Token de webhook inválido recebido em "asaas-access-token".',
      );
      throw new UnauthorizedException('Token de webhook do Asaas inválido');
    }

    return true;
  }
}
