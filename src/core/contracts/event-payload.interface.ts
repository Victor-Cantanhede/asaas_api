export interface EventPayload<T = any> {
  eventId?: string;
  timestamp?: string;
  data: T;
}
