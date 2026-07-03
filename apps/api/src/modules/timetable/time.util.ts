import { BadRequestException } from "@nestjs/common";

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(s: string): boolean {
  return TIME_REGEX.test(s);
}

export function assertTimeRange(start: string, end: string): void {
  if (!isValidTime(start)) {
    throw new BadRequestException(`Invalid time format: "${start}". Expected HH:mm (24h)`);
  }
  if (!isValidTime(end)) {
    throw new BadRequestException(`Invalid time format: "${end}". Expected HH:mm (24h)`);
  }
  if (start >= end) {
    throw new BadRequestException(
      `startTime "${start}" must be before endTime "${end}"`,
    );
  }
}
