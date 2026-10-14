type Profile = { match: string; status: number; body: unknown; delayMs?: number; headers?: Record<string, string> };
type Env = { BENCHMARK_MOCK_PROFILE?: string };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const profiles = JSON.parse(env.BENCHMARK_MOCK_PROFILE ?? "[]") as Profile[];
    const key = `${request.method} ${new URL(request.url).origin}${new URL(request.url).pathname}`;
    const profile = profiles.find((item) => item.match === key);
    // Unconfigured dependencies are explicitly unsupported, never successful stubs.
    if (!profile) return Response.json({ code: "BENCHMARK_MOCK_NOT_CONFIGURED", dependency: key }, { status: 502 });
    if (profile.delayMs) await new Promise((resolve) => setTimeout(resolve, Math.min(profile.delayMs!, 60_000)));
    return Response.json(profile.body, { status: profile.status, headers: profile.headers });
  }
};
