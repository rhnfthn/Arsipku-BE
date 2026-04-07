import { BadRequestException } from '@nestjs/common';

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function extractComparableDate(dateInput: string): string | null {
  const trimmed = dateInput.trim();

  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return toLocalDateString(parsed);
}

export function assertDateNotInFuture(
  dateInput?: string | null,
  fieldLabel: string = 'Tanggal',
): void {
  if (!dateInput) {
    return;
  }

  const comparableDate = extractComparableDate(String(dateInput));
  if (!comparableDate) {
    return;
  }

  const today = toLocalDateString(new Date());
  if (comparableDate > today) {
    throw new BadRequestException(
      `${fieldLabel} tidak boleh melebihi tanggal hari ini`,
    );
  }
}
