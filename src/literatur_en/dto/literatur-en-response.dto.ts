export class LiteraturEnDto {
  id: string;
  company?: string;
  start_date?: string;
  end_date?: string;
  object_type?: 'CO' | 'PA' | 'SA' | 'S' | null;
  long_text?: string | null;
  long_text_en?: string | null;
  create_at?: string;
  update_at?: string;
}
