import { ApiProperty } from '@nestjs/swagger';

export class WebhookResponseDto {
  @ApiProperty({ example: true })
  received: boolean;

  @ApiProperty({ example: 'Webhook recebido com sucesso e enfileirado para processamento assíncrono.' })
  message: string;
}
