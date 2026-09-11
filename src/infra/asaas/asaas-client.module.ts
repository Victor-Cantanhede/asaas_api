import { Global, Module } from '@nestjs/common';
import { AsaasClientProvider } from './asaas-client.provider';

@Global()
@Module({
  providers: [AsaasClientProvider],
  exports: [AsaasClientProvider],
})
export class AsaasClientModule {}
