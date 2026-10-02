import { Injectable } from "@nestjs/common";
import type { RunContext } from "./run-context";

/** Reads recruiter replies at the start of each run. Implemented in phase 7. */
@Injectable()
export class ReplyService {
  async handle(ctx: RunContext): Promise<void> {
    ctx.log.info("replies", "Reply handling not configured yet");
  }
}

/** Sends the run summary. Implemented in phase 7. */
@Injectable()
export class NotifyService {
  async send(ctx: RunContext, _state: { blocked: string[] }): Promise<void> {
    ctx.log.info("notify", "Notifications not configured yet");
  }
}
