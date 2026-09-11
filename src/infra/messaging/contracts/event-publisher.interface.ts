export interface IEventPublisher {
  publish<T = any>(pattern: string, data: T): Promise<void>;
}

export const EVENT_PUBLISHER_TOKEN = Symbol('IEventPublisher');
