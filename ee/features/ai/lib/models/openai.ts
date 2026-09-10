import { OpenAI } from "openai";

// AI features are out of scope for this deployment and OPENAI_API_KEY is
// never set, so constructing the real client eagerly (as a module-level
// `new OpenAI(...)`) throws "Missing credentials" the moment this module is
// imported - and Next.js imports every route module during its build-time
// "collecting page data" step, regardless of whether the route is ever
// called, which crashed the production build. Deferring construction to
// first actual use means the build (and every other route that happens to
// share this import graph) never touches the OpenAI SDK unless an AI
// feature request actually reaches one of these (feature-flagged, disabled)
// endpoints at runtime.
let client: OpenAI | undefined;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return client;
}

export const openai = new Proxy({} as OpenAI, {
  get(_target, prop, _receiver) {
    const value = Reflect.get(getClient(), prop, getClient());
    return typeof value === "function" ? value.bind(getClient()) : value;
  },
});
