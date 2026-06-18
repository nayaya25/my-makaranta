import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use(helmet());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const origins = (process.env.CORS_ORIGINS ?? process.env.APP_BASE_URL ?? "http://localhost:3000")
    .split(",").map((s) => s.trim()).filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
  // Correct client IP behind a reverse proxy (for the rate limiter); harmless locally.
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set("trust proxy", 1);
  await app.listen(Number(process.env.PORT ?? 4000));
}
void bootstrap();
