export type DeliveryKind = "alert" | "sheets";
export type DeliveryStatus = "pending" | "delivered" | "failed" | "cancelled";

export type AlertSettings = {
  address?: string;
  enabled?: boolean;
  requestAt?: number;
  challenge?: { address: string; digest: string; attempts: number; expiresAt: number };
};

export type DeliveryRow = {
  responseId: string;
  kind: DeliveryKind;
  status: DeliveryStatus;
  updatedAt: string;
  detail: string | null;
};

export type AlertView = {
  configured: boolean;
  address: string;
  available: boolean;
  enabled: boolean;
  awaitingCode: boolean;
};

export type SheetsField = { id: string; label: string; type: string };

export type SheetsConnection = {
  spreadsheetId: string;
  sheetId: number;
  title: string;
  fields: SheetsField[];
};

export type SheetsSettings = {
  setup?: { code: string; expiresAt: number; spreadsheetId?: string };
  connection?: SheetsConnection;
};

export type SheetsView = {
  serviceEmail: string | null;
  code: string | null;
  connection: SheetsConnection | null;
  publishedFields: SheetsField[];
  mappingIssue: string | null;
};
