import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class AsaasWebhookAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const tokenHeader = request.headers['asaas-access-token'];
    const configuredSecret = this.configService.get<string>(
      'ASAAS_WEBHOOK_SECRET',
    );

    if (!tokenHeader || !configuredSecret) {
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
      throw new UnauthorizedException('Token de webhook do Asaas inválido');
    }

    return true;
  }
}
