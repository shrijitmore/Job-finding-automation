import { Controller, Get, Inject } from "@nestjs/common";
import { sql, type Db } from "@jfa/db";
import { Public } from "./common/current-user";
import { DB } from "./db/db.module";

@Controller("health")
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Public()
  @Get()
  async health() {
    await this.db.execute(sql`select 1`);
    return { ok: true };
  }
}
