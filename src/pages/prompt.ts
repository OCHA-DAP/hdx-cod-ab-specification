import type { APIRoute } from "astro";
import { promptContent } from "../lib/spec-sources";

export const GET: APIRoute = () =>
  new Response(promptContent(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
