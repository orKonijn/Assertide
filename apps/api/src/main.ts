import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import expressParser from 'express';
import type { Express } from 'express';
import { connectDatabase } from './database.ts';
import { LabService, mountLab } from './lab.ts';

@Module({})
class AppModule {}

const db = await connectDatabase(process.env['DATABASE_URL']);
const app = await NestFactory.create(AppModule);
const express: Express = app.getHttpAdapter().getInstance();
express.use(expressParser.json({ limit: '64kb' }));
if (process.env['ENABLE_LAB'] === 'true') {
  if (process.env['NODE_ENV'] === 'production') throw new Error('Lab must run separately from production');
  const password = process.env['LAB_PASSWORD'];
  const signingKey = process.env['LAB_SIGNING_KEY'];
  if (!password || !signingKey) throw new Error('LAB_PASSWORD and LAB_SIGNING_KEY required');
  const lab = new LabService(db, password, signingKey);
  await lab.initialize();
  mountLab(express, lab);
}
express.get('/health', (_req, res) => { res.json({ status: 'ok' }); });
await app.listen(Number(process.env['PORT'] ?? 4010), '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close().then(() => db.close()); });
