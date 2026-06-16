import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";
import { PaymentChannel } from "@prisma/client";

export class RecordPaymentDto {
  @IsString() @IsNotEmpty() invoiceId!: string;
  @IsInt() @Min(1) amountKobo!: number;
  @IsEnum(PaymentChannel) channel!: PaymentChannel;
  @IsOptional() @IsString() reference?: string;
}

export class InitializeOnlineDto {
  @IsString() @IsNotEmpty() invoiceId!: string;
  @IsInt() @Min(1) amountKobo!: number;
  @IsEmail() email!: string;
}

export class VerifyPaymentDto {
  @IsString() @IsNotEmpty() reference!: string;
}
