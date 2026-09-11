import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';

export function setupSwagger(app: INestApplication): void {
  const logger = new Logger('SwaggerSetup');
  let configService: ConfigService | null = null;
  try {
    configService = app.get(ConfigService, { strict: false });
  } catch {
    // Contexto de teste onde ConfigService pode não estar registrado no container raiz
  }

  const nodeEnv =
    configService?.get<string>('NODE_ENV') ||
    process.env.NODE_ENV ||
    'development';
  const isProduction = nodeEnv === 'production';

  const swaggerUser =
    configService?.get<string>('SWAGGER_USER') || process.env.SWAGGER_USER;
  const swaggerPassword =
    configService?.get<string>('SWAGGER_PASSWORD') ||
    process.env.SWAGGER_PASSWORD;
  const swaggerExplicitlyEnabled =
    (configService?.get<string>('SWAGGER_ENABLED') ||
      process.env.SWAGGER_ENABLED) === 'true';

  // 1. Em ambiente de produção, desativa completamente se não houver credenciais e não estiver explicitamente habilitado
  if (
    isProduction &&
    !swaggerExplicitlyEnabled &&
    (!swaggerUser || !swaggerPassword)
  ) {
    logger.warn(
      'Ambiente de produção detectado: Swagger UI e OpenAPI spec (/docs e /docs-json) estão desabilitados por padrão para segurança.',
    );
    return;
  }

  // 2. Se houver credenciais configuradas, protege /docs e /docs-json com HTTP Basic Auth
  if (swaggerUser && swaggerPassword) {
    const basicAuthMiddleware = (req: any, res: any, next: any) => {
      const path = req.path || req.url || '';
      if (!path.startsWith('/docs') && !path.startsWith('/docs-json')) {
        return next();
      }

      const authHeader = req.headers['authorization'] || '';
      if (!authHeader.startsWith('Basic ')) {
        res.setHeader(
          'WWW-Authenticate',
          'Basic realm="Asaas API Swagger Docs"',
        );
        return res
          .status(401)
          .send('Acesso não autorizado: credenciais básicas necessárias');
      }

      try {
        const credentials = Buffer.from(
          authHeader.substring(6).trim(),
          'base64',
        ).toString('utf8');
        const colonIdx = credentials.indexOf(':');
        if (colonIdx === -1) {
          res.setHeader(
            'WWW-Authenticate',
            'Basic realm="Asaas API Swagger Docs"',
          );
          return res.status(401).send('Credenciais inválidas');
        }

        const inputUser = Buffer.from(credentials.substring(0, colonIdx));
        const inputPass = Buffer.from(credentials.substring(colonIdx + 1));
        const validUser = Buffer.from(swaggerUser);
        const validPass = Buffer.from(swaggerPassword);

        const isUserValid =
          inputUser.length === validUser.length &&
          timingSafeEqual(inputUser, validUser);
        const isPassValid =
          inputPass.length === validPass.length &&
          timingSafeEqual(inputPass, validPass);

        if (!isUserValid || !isPassValid) {
          res.setHeader(
            'WWW-Authenticate',
            'Basic realm="Asaas API Swagger Docs"',
          );
          return res.status(401).send('Credenciais inválidas');
        }

        return next();
      } catch {
        res.setHeader(
          'WWW-Authenticate',
          'Basic realm="Asaas API Swagger Docs"',
        );
        return res.status(401).send('Credenciais inválidas');
      }
    };

    app.use(basicAuthMiddleware);
  }

  const config = new DocumentBuilder()
    .setTitle('Asaas API — Gateway Financeiro Orientado a Eventos')
    .setDescription(
      'Microsserviço de abstração e gateway assíncrono para o Asaas v3. ' +
        'Opera com arquitetura de Monólito Modular Orientado a Eventos (RabbitMQ), ' +
        'respostas imediatas HTTP 202 Accepted em endpoints de escrita e repasse via Webhooks.',
    )
    .setVersion('1.0.0')
    .addApiKey(
      { type: 'apiKey', name: 'x-api-key', in: 'header' },
      'x-api-key',
    )
    .addTag(
      'Clientes',
      'Comandos assíncronos de gestão e sincronização de clientes',
    )
    .addTag(
      'Cobranças PIX',
      'Emissão assíncrona de PIX e captura de QR Code via RabbitMQ',
    )
    .addTag(
      'Cartão de Crédito',
      'Cobranças avulsas/parceladas e tokenização assíncrona',
    )
    .addTag(
      'Assinaturas',
      'Ciclo de vida de assinaturas recorrentes com mensageria',
    )
    .addTag(
      'Webhooks',
      'Recepção ultra-rápida (<10ms) e repasse tolerante a falhas',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}
