import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { IEventPublisher } from './contracts/event-publisher.interface';
import { RMQ_CLIENT_TOKEN } from './messaging.constants';

@Injectable()
export class RmqEventPublisher implements IEventPublisher {
  constructor(
    @Inject(RMQ_CLIENT_TOKEN) private readonly client: ClientProxy,
  ) {}

  async publish<T = any>(pattern: string, data: T): Promise<void> {
    this.client.emit(pattern, data);
  }
}
