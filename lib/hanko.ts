import { tenant } from "@teamhanko/passkeys-next-auth-provider";

let _hanko: ReturnType<typeof tenant> | null = null;

function getHanko() {
  if (_hanko) return _hanko;

  if (!process.env.HANKO_API_KEY || !process.env.NEXT_PUBLIC_HANKO_TENANT_ID) {
    throw new Error(
      "Please set HANKO_API_KEY and NEXT_PUBLIC_HANKO_TENANT_ID in your .env.local file.",
    );
  }

  _hanko = tenant({
    apiKey: process.env.HANKO_API_KEY!,
    tenantId: process.env.NEXT_PUBLIC_HANKO_TENANT_ID!,
  });

  return _hanko;
}

const hanko = new Proxy({} as ReturnType<typeof tenant>, {
  get(_target, prop) {
    return getHanko()[prop as keyof ReturnType<typeof tenant>];
  },
});

export default hanko;
