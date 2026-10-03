import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Restoration Estimates API')
    .setDescription('REST API for managing property restoration estimates.')
    .setVersion('1.0.0')
    .addTag('jobs')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
}

void bootstrap();
