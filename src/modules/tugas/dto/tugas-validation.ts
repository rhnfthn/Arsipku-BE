import { Transform } from 'class-transformer';
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

export function IsLocalDate(validationOptions?: ValidationOptions) {
  return (target: object, propertyName: string): void => {
    registerDecorator({
      name: 'isLocalDate',
      target: target.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
          if (!match) return false;
          const year = Number(match[1]);
          const month = Number(match[2]);
          const day = Number(match[3]);
          const parsed = new Date(Date.UTC(year, month - 1, day));
          return (
            parsed.getUTCFullYear() === year &&
            parsed.getUTCMonth() === month - 1 &&
            parsed.getUTCDate() === day
          );
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} harus berupa tanggal YYYY-MM-DD yang valid`;
        },
      },
    });
  };
}
