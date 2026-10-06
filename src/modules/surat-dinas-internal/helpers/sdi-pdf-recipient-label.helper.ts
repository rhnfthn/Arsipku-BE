import { formatDeputyPositionLabel } from './deputy-position-label.helper';
import { formatGmRecipientLabel } from '../../../common/helpers/gm-recipient-label.helper';

type SdiPdfRecipientSource = {
  position_text?: string | null;
  positionText?: string | null;
  position_abbreviation?: string | null;
  abbreviation?: string | null;
  persnum_person_text?: string | null;
  namaSirkuler?: string | null;
  nama?: string | null;
  sub_area_text?: string | null;
  subAreaText?: string | null;
  area_text?: string | null;
  areaText?: string | null;
  position_status?: string | null;
  positionStatus?: string | null;
};

/** SDI menampilkan GM tanpa abbreviation; penerima lain mempertahankan label jabatan. */
export function formatSdiPdfRecipientLabel(
  source: SdiPdfRecipientSource,
): string {
  return (
    formatGmRecipientLabel(source, false) ?? formatDeputyPositionLabel(source)
  );
}
