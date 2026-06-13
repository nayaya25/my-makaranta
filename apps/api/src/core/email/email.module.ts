import { Global, Module } from "@nestjs/common";
import { EMAIL_SERVICE } from "./email.types";
import { LogEmailAdapter } from "./log.adapter";
import { MailgunEmailAdapter } from "./mailgun.adapter";

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_SERVICE,
      useFactory: () =>
        process.env.EMAIL_PROVIDER === "mailgun" ? new MailgunEmailAdapter() : new LogEmailAdapter(),
    },
  ],
  exports: [EMAIL_SERVICE],
})
export class EmailModule {}
