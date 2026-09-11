import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { EVENT_PUBLISHER_TOKEN } from './contracts/event-publisher.interface';
import { RMQ_CLIENT_TOKEN } from './messaging.constants';
import { RmqEventPublisher } from './rmq-event-publisher';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: RMQ_CLIENT_TOKEN,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
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
          },
        }),
      },
    ]),
  ],
  providers: [
    {
      provide: EVENT_PUBLISHER_TOKEN,
      useClass: RmqEventPublisher,
    },
  ],
  exports: [EVENT_PUBLISHER_TOKEN, ClientsModule],
})
export class MessagingModule {}
