import { expect, test } from "bun:test";
import {
  chooseAction,
  createDecisionProvider,
  decisionInput,
} from "../../src/core/arena/provider.ts";
import { fixture } from "./arena-engine.test.ts";

test("model sees own tactics but no avatars, names or revealed tactics", () => {
  const m = fixture();
  m.revealedPrompts = { b: "OPPONENT_SECRET" };
  m.fighters[1]!.name = "NAME_SECRET";
  const input = decisionInput(m, "a", "OWN_TACTICS");
  expect(input).toContain("OWN_TACTICS");
  expect(input).not.toContain("OPPONENT_SECRET");
  expect(input).not.toContain("NAME_SECRET");
  expect(input).not.toContain("avatar");
});
test("timeouts and invalid model output fall back without hanging", async () => {
  const m = fixture();
  expect(
    await chooseAction(
      { model: "fake", decide: async () => new Promise(() => {}) },
      m,
      "a",
      "secret",
      5,
    ),
  ).toBeNull();
  expect(
    await chooseAction(
      { model: "fake", decide: async () => ({ kind: "attack", targetId: "missing" }) },
      m,
      "a",
      "secret",
    ),
  ).toBeNull();
});
test("provider uses fixed model, bounded output, schema and server credentials", async () => {
  let request: RequestInit | undefined;
  const p = createDecisionProvider(
    { ARENA_PROVIDER: "jev", ARENA_MODEL: "test-model", AI_GATEWAY_API_KEY: "server-key" },
    async (_, init) => {
      request = init;
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({ kind: "defend", x: null, y: null, targetId: null }),
            },
          },
        ],
      });
    },
  )!;
  expect(await chooseAction(p, fixture(), "a", "circle and defend")).toEqual({ kind: "defend" });
  const body = JSON.parse(String(request!.body));
  expect(body.model).toBe("test-model");
  expect(body.max_tokens).toBe(160);
  expect(body.response_format.json_schema.strict).toBe(true);
});
