import type { Draft } from "./storage";
import type { WorkshopStore } from "./workshop-storage";

export type WorkshopBackup = {
  format: "cairo-verre-workshop-backup";
  version: 1;
  exportedAt: string;
  cloudRevision: number;
  data: WorkshopStore & { drafts: Draft[] };
};

export function serializeWorkshopBackup(
  workshop: WorkshopStore,
  drafts: Draft[],
  cloudRevision: number,
  exportedAt = new Date().toISOString(),
): string {
  const backup: WorkshopBackup = {
    format: "cairo-verre-workshop-backup",
    version: 1,
    exportedAt,
    cloudRevision,
    data: {
      ...workshop,
      version: 1,
      customers: workshop.customers || [],
      drafts,
    },
  };
  return JSON.stringify(backup, null, 2);
}
