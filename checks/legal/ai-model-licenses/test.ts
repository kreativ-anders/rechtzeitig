import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("skips without models", async () => {
  const result = await runRepoCheck(here, { "app.py": 'import os\npath = "src/app.py"\n' });
  assert.equal(result.status, "skip");
});

test("warns for a non-commercial model, with line", async () => {
  const result = await runRepoCheck(here, { "app.py": 'from transformers import pipeline\n\nt = pipeline("translation", model="facebook/nllb-200-distilled-600M")\n' });
  assert.equal(result.status, "warn");
  assert.match(result.details[0], /^app\.py:3: facebook\/nllb-200-distilled-600M: CC-BY-NC-4\.0\. Non-commercial use only/);
});

test("notes models with conditions, from code, config and URLs", async () => {
  const result = await runRepoCheck(here, {
    "src/llm.ts": 'const MODEL = "meta-llama/Llama-3.1-8B-Instruct";\n',
    "config.yml": "model: google/gemma-2-9b-it\n",
    "README.md": "meta-llama/Llama-3.1-8B-Instruct is not code",
    "download.sh": "",
    "models.json": '{"url": "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors"}',
  });
  assert.equal(result.status, "info");
  assert.equal(result.details.length, 3);
  assert.match(result.details[0], /^config\.yml:1: google\/gemma-2-9b-it: Gemma Terms of Use/);
  assert.match(result.details[2], /^src\/llm\.ts:1: meta-llama\/Llama-3\.1-8B-Instruct: Llama 3\.1 Community License\. .*700 million/);
});

test("ignores open models and fixtures", async () => {
  const result = await runRepoCheck(here, {
    "app.py": 'm = "google/gemma-4-E4B-it"\nn = "mistralai/Mistral-7B-v0.1"\n',
    "test/fixtures/app.py": 'm = "facebook/musicgen-small"\n',
    "app.test.ts": 'const m = "facebook/musicgen-small";\n',
    "lib/patterns.ts": 'const RE = /^facebook\\/musicgen-/;\n',
  });
  assert.equal(result.status, "skip");
});

test("lists weight files, with the license when the name tells it", async () => {
  const result = await runRepoCheck(here, { "models/Llama-3.2-3B-Instruct-Q4_K_M.gguf": "x", "models/classifier.onnx": "x" });
  assert.equal(result.status, "info");
  assert.match(result.details.join("\n"), /models\/Llama-3\.2-3B-Instruct-Q4_K_M\.gguf: Llama-3\.2-3B-Instruct-Q4_K_M\.gguf: Llama Community License/);
  assert.match(result.details.join("\n"), /models\/classifier\.onnx: Model weights of unknown origin/);
});
