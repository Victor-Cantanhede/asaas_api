import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

import { setupSwagger } from './setup-swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  setupSwagger(app);

  // Conexão do Microservice RabbitMQ para consumo assíncrono de eventos
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [configService.getOrThrow<string>('RABBITMQ_URL')],
      queue: configService.get<string>(
        'RABBITMQ_MAIN_QUEUE',
        'asaas_main_queue',
      ),
      queueOptions: {
        durable: true,
      },
      noAck: false, // Confirmação manual obrigatória nos consumers
    },
  });

  await app.startAllMicroservices();

  const port = configService.get<number>('PORT', 5006);
  await app.listen(port);
  console.log(`🚀 Asaas API rodando na porta ${port}`);
  console.log(`📑 Swagger UI disponível em http://localhost:${port}/docs`);
}
bootstrap();
