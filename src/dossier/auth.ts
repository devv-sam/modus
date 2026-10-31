import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "data");
const AUTH_PATH = resolve(DATA_DIR, "dossier-auth.json");
const CALLBACK_PORT = 8765;

interface Stored {
  clientId: string;
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

function load(): Stored | null {
  if (!existsSync(AUTH_PATH)) return null;
  try {
    return JSON.parse(readFileSync(AUTH_PATH, "utf8")) as Stored;
  } catch {
    return null;
  }
}

function save(auth: Stored): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(AUTH_PATH, JSON.stringify(auth, null, 2) + "\n", "utf8");
}

async function tokenRequest(baseUrl: string, params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${baseUrl}/api/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse & { error_description?: string };
  if (!res.ok) throw new Error(body.error_description ?? `Dossier token endpoint answered ${res.status}`);
  return body;
}

export async function getAccessToken(baseUrl: string): Promise<string> {
  const auth = load();
  if (!auth) throw new Error("Not connected to Dossier. Run: npm run connect-dossier");
  if (auth.expiresAt - Date.now() > 60_000) return auth.accessToken;

  let tokens: TokenResponse;
  try {
    tokens = await tokenRequest(baseUrl, { grant_type: "refresh_token", refresh_token: auth.refreshToken, client_id: auth.clientId });
  } catch (err) {
    throw new Error(`Dossier sign-in expired (${(err as Error).message}). Run: npm run connect-dossier`);
  }
  save({ ...auth, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + tokens.expires_in * 1000 });
  return tokens.access_token;
}

export function isConnected(): boolean {
  return load() !== null;
}

/** One-time browser sign-in: registers modus with Dossier and stores the refresh token. */
export async function connect(baseUrl: string): Promise<void> {
  const redirectUri = `http://127.0.0.1:${CALLBACK_PORT}/callback`;
  const reg = await fetch(`${baseUrl}/api/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "modus", redirect_uris: [redirectUri] }),
  });
  if (!reg.ok) throw new Error(`Dossier refused registration (${reg.status}). Is Settings → MCP connector on?`);
  const { client_id: clientId } = (await reg.json()) as { client_id: string };

  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const url = new URL(`${baseUrl}/oauth/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state,
    resource: `${baseUrl}/api/mcp`,
  }).toString();

  console.log(`Open this address, sign in to Dossier if asked, then press Allow:\n\n${url}\n`);

  const code = await new Promise<string>((res, rej) => {
    const server = createServer((req, out) => {
      const params = new URL(req.url ?? "/", redirectUri).searchParams;
      if (params.get("state") !== state || !params.get("code")) {
        out.writeHead(400).end("Bad request");
        return;
      }
      out.writeHead(200, { "content-type": "text/plain" }).end("modus is connected to Dossier. You can close this tab.");
      server.close();
      res(params.get("code")!);
    });
    server.on("error", rej);
    server.listen(CALLBACK_PORT, "127.0.0.1");
    setTimeout(() => {
      server.close();
      rej(new Error("Timed out waiting for Allow."));
    }, 10 * 60_000);
  });

  const tokens = await tokenRequest(baseUrl, {
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  save({ clientId, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + tokens.expires_in * 1000 });
  console.log("Connected. Tokens saved to data/dossier-auth.json.");
}
