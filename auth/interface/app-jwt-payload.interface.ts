export interface AppJwtPayload {
  id: string; // user.id
  persnum: number;
  name: string;
  rolelId: string | null;
  role: string | null;
  channelId: string | null;
  channel: string | null;

  company: number | null;
  companyText: string | null;
  area: string | null;
  areaText: string | null;
  subArea: number | null;
  subAreaText: string | null;
  organization: number | null;
  organizationText: string | null;
  position: number | null;
  positionText: string | null;
}
