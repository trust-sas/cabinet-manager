/**
 * backend/src/main.ts
 * ---------------------------------------------------------------------------
 * Point d'entrée du serveur NestJS — Cabinet Manager API.
 *
 * Bootstrap :
 *  1. Création de l'application NestJS
 *  2. Activation de la validation globale des DTO (class-validator)
 *  3. Transformation automatique des payloads (class-transformer)
 *  4. Filtre global d'exceptions HTTP
 *  5. CORS restreint aux origines configurées
 *  6. Écoute sur le port configuré (défaut : 8080)
 * ---------------------------------------------------------------------------
 */
import * as dotenv from 'dotenv';
dotenv.config({ override: true }); // override: true force le rechargement même si la var existe déjà
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Validation globale des DTO ────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // Supprime les propriétés non décorées
      forbidNonWhitelisted: true, // Rejette si des propriétés inconnues sont présentes
      transform: true,        // Transforme les types automatiquement (string → number, etc.)
    }),
  );

  // ── Filtre global d'exceptions ────────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());

  // ── CORS ──────────────────────────────────────────────────────────────────
  const isDev = process.env.NODE_ENV === 'development';
  const originsEnv = process.env.CORS_ORIGINS ?? '';
  const allowedOrigins = originsEnv.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin: isDev ? true : (allowedOrigins.length > 0 ? allowedOrigins : false),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // ── Préfixe global de l'API ───────────────────────────────────────────────
  // Toutes les routes sont préfixées par /api/v1 (cohérent avec Traefik dynamic_conf.yml)
  app.setGlobalPrefix('api/v1');

  // ── Démarrage ─────────────────────────────────────────────────────────────
  const port = parseInt(process.env.PORT ?? '3007', 10);
  await app.listen(port, '0.0.0.0');
  console.log(`[Cabinet Manager API] Serveur démarré sur le port ${port}`);
}

bootstrap();
