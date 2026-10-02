import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { Application } from "@jfa/db";
import type { RunContext } from "./run-context";

/** Steps the graph calls. Implemented by RunSteps, ReplyService and NotifyService. */
export interface GraphDeps {
  replies(ctx: RunContext): Promise<void>;
  fetch(ctx: RunContext): Promise<{ jobIds: string[]; blocked: string[] }>;
  filter(ctx: RunContext, ids: string[]): Promise<string[]>;
  score(ctx: RunContext, ids: string[]): Promise<void>;
  shortlist(ctx: RunContext): Promise<Application[]>;
  tailor(ctx: RunContext, apps: Application[]): Promise<void>;
  apply(ctx: RunContext): Promise<void>;
  notify(ctx: RunContext, state: { blocked: string[] }): Promise<void>;
}

const RunState = Annotation.Root({
  fetchedIds: Annotation<string[]>({ reducer: (_a, b) => b, default: () => [] }),
  filteredIds: Annotation<string[]>({ reducer: (_a, b) => b, default: () => [] }),
  shortlisted: Annotation<Application[]>({ reducer: (_a, b) => b, default: () => [] }),
  blocked: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
});

export type RunGraphState = typeof RunState.State;

/**
 * One run for one profile:
 * replies -> fetch -> filter -> score -> tailor (incl. validate) -> apply -> notify.
 * Steps that find nothing to do skip ahead to notify.
 */
export function buildRunGraph(ctx: RunContext, deps: GraphDeps) {
  const timed = <T>(step: string, fn: () => Promise<T>) => ctx.log.time(step, fn);

  return new StateGraph(RunState)
    .addNode("replies", async () => {
      await timed("replies", () => deps.replies(ctx));
      return {};
    })
    .addNode("fetch", async () => {
      const r = await timed("fetch", () => deps.fetch(ctx));
      return { fetchedIds: r.jobIds, blocked: r.blocked };
    })
    .addNode("filter", async (s) => ({ filteredIds: await timed("filter", () => deps.filter(ctx, s.fetchedIds)) }))
    .addNode("score", async (s) => {
      await timed("score", () => deps.score(ctx, s.filteredIds));
      return { shortlisted: await deps.shortlist(ctx) };
    })
    .addNode("tailor", async (s) => {
      await timed("tailor", () => deps.tailor(ctx, s.shortlisted));
      return {};
    })
    .addNode("apply", async () => {
      await timed("apply", () => deps.apply(ctx));
      return {};
    })
    .addNode("notify", async (s) => {
      await timed("notify", () => deps.notify(ctx, { blocked: s.blocked }));
      return {};
    })
    .addEdge(START, "replies")
    .addEdge("replies", "fetch")
    .addEdge("fetch", "filter")
    .addEdge("filter", "score")
    .addConditionalEdges("score", (s) => (s.shortlisted.length ? "tailor" : "apply"), ["tailor", "apply"])
    .addEdge("tailor", "apply")
    .addEdge("apply", "notify")
    .addEdge("notify", END)
    .compile();
}
