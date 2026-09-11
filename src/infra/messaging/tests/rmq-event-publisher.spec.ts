import { Test, TestingModule } from '@nestjs/testing';
import { ClientProxy } from '@nestjs/microservices';
import { of } from 'rxjs';
import { RmqEventPublisher } from '../rmq-event-publisher';
import { RMQ_CLIENT_TOKEN } from '../messaging.constants';

describe('RmqEventPublisher', () => {
  let publisher: RmqEventPublisher;
  let clientMock: jest.Mocked<Partial<ClientProxy>>;

  beforeEach(async () => {
    clientMock = {
      emit: jest.fn().mockReturnValue(of(true)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RmqEventPublisher,
        {
          provide: RMQ_CLIENT_TOKEN,
          useValue: clientMock,
        },
      ],
    }).compile();

    publisher = module.get<RmqEventPublisher>(RmqEventPublisher);
  });

  it('should be defined', () => {
    expect(publisher).toBeDefined();
  });

  it('should emit event with correct pattern and data', async () => {
    const pattern = 'test.event';
    const data = { id: '123', value: 'sample' };

    await publisher.publish(pattern, data);

    expect(clientMock.emit).toHaveBeenCalledTimes(1);
    expect(clientMock.emit).toHaveBeenCalledWith(pattern, data);
  });

  it('should propagate error if client.emit fails', async () => {
    clientMock.emit = jest.fn().mockImplementation(() => {
      throw new Error('Broker connection error');
    });

    await expect(publisher.publish('test.event', {})).rejects.toThrow(
      'Broker connection error',
    );
  });
});
