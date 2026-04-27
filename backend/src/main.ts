import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

loadEnv({ path: resolve(__dirname, '../../.env') });
loadEnv({ path: resolve(__dirname, '../.env'), override: true });

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({ origin: '*' });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
