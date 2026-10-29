/**
 * Only the production droplet syncs banks; it is the source of truth and the
 * Mac pulls its database with `make db-pull`. A sync from the Mac would fork
 * the data (and spend SimpleFIN's daily request quota). Set BUD_ALLOW_SYNC=1
 * to override on purpose.
 */
export function bankSyncAllowed(): boolean {
  return process.env.NODE_ENV === "production" || process.env.BUD_ALLOW_SYNC === "1";
}

export const SYNC_REFUSED_MESSAGE =
  "Bank sync is off on this machine. The production server syncs the banks and is the source of truth; run `make db-pull` to bring its numbers here. Set BUD_ALLOW_SYNC=1 to sync from here anyway.";
