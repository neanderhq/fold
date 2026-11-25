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
