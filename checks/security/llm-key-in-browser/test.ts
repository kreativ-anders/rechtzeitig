import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("fails for dangerouslyAllowBrowser and AI keys under a public prefix", async () => {
  const result = await runRepoCheck(here, {
    "src/lib/ai.ts": "export const openai = new OpenAI({ apiKey: import.meta.env.VITE_OPENAI_API_KEY, dangerouslyAllowBrowser: true });",
    ".env.example": "NEXT_PUBLIC_ANTHROPIC_API_KEY=\n",
  });
  assert.equal(result.status, "fail");
  assert.deepEqual(result.raw.details?.map((d) => [d.file, d.key]), [[".env.example", "public_key"], ["src/lib/ai.ts", "allow_browser"]]);
});

test("warns for a server AI SDK in a client component", async () => {
  const result = await runRepoCheck(here, { "app/chat/page.tsx": '"use client";\nimport OpenAI from "openai";\n' });
  assert.equal(result.status, "warn");
  assert.match(result.details[0], /openai is imported in a file that runs in the browser/);
});

test("passes for AI calls on the server and client hooks", async () => {
  const result = await runRepoCheck(here, {
    "app/api/chat/route.ts": 'import OpenAI from "openai";\nconst openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });',
    "app/chat/page.tsx": '"use client";\nimport { useChat } from "@ai-sdk/react";\nimport type { ChatCompletion } from "openai";',
    ".env.example": "OPENAI_API_KEY=\n",
  });
  assert.equal(result.status, "pass");
});
