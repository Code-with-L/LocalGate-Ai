import type { Result } from "./primitives";
import { err, ok } from "./primitives";

export interface Site {
  readonly entityId: string;
  readonly entityType: "Site";
  readonly name: string;
  readonly createdAtUtc: string;
}

export interface SiteCreateInput {
  id: string;
  name: string;
  createdAtUtc: string;
}

export type SiteValidationError = { kind: "name-empty" };

export function createSite(input: SiteCreateInput): Result<Site, SiteValidationError> {
  const name = input.name.trim();
  if (name.length === 0) {
    return err({ kind: "name-empty" });
  }
  const site: Site = Object.freeze({
    entityId: input.id,
    entityType: "Site" as const,
    name,
    createdAtUtc: input.createdAtUtc,
  });
  return ok(site);
}

export function siteOwnsGate(site: Site, gateSiteId: string): boolean {
  return gateSiteId === site.entityId;
}

export function siteHasGate(site: Site, gateSiteIds: readonly string[]): boolean {
  return gateSiteIds.some((gateSiteId) => siteOwnsGate(site, gateSiteId));
}
