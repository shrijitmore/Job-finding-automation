import { eq, pageCache, type Db } from "@jfa/db";
import type { PageCacheStore } from "@jfa/scraper";

export class DbPageCache implements PageCacheStore {
  constructor(private readonly db: Db) {}

  async get(url: string) {
    const [row] = await this.db.select().from(pageCache).where(eq(pageCache.url, url));
    return row ? { contentHash: row.contentHash, extracted: row.extracted } : null;
  }

  async set(url: string, contentHash: string, extracted: unknown) {
    await this.db
      .insert(pageCache)
      .values({ url, contentHash, extracted, fetchedAt: new Date() })
      .onConflictDoUpdate({ target: pageCache.url, set: { contentHash, extracted, fetchedAt: new Date() } });
  }
}
