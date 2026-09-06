import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const AUTH_EMAIL_DOMAIN = "users.f1nancer.local";
const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;
const RESERVED = new Set([
  "admin",
  "administrator",
  "api",
  "auth",
  "f1nancer",
  "help",
  "null",
  "root",
  "support",
  "system",
  "undefined",
  "user",
]);
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 20;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function normalizeUsername(raw: string) {
  return raw.trim().toLowerCase();
}

function validateUsername(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("Username is required");
  const username = normalizeUsername(raw);
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error(
      "Username must be 3–32 characters: lowercase letters, numbers, or underscore",
    );
  }
  if (RESERVED.has(username)) throw new Error("That username is reserved");
  return username;
}

function validatePassword(raw: unknown) {
  if (typeof raw !== "string" || raw.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const admin = createClient(supabaseUrl, serviceKey);
  const anon = createClient(supabaseUrl, anonKey);

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  try {
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { count } = await admin
      .from("auth_rate_limits")
      .select("id", { count: "exact", head: true })
      .eq("key", ip)
      .gte("attempted_at", since);
    if ((count ?? 0) >= MAX_ATTEMPTS) {
      return json({ error: "Too many attempts. Try again later." }, 429);
    }
    await admin.from("auth_rate_limits").insert({ key: ip });

    const payload = await req.json();
    const action = payload.action as string;
    const username = validateUsername(payload.username);
    validatePassword(payload.password);
    const email = `${username}@${AUTH_EMAIL_DOMAIN}`;

    if (action === "signup") {
      const { data: existing } = await admin
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      if (existing) {
        return json({ error: "Username is already taken" }, 409);
      }
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: payload.password,
        email_confirm: true,
        user_metadata: { username },
      });
      if (error) return json({ error: error.message }, 400);
      if (data.user) {
        await admin.rpc("seed_user_defaults", {
          p_user_id: data.user.id,
          p_username: username,
        });
      }
      const { data: sessionData, error: signError } =
        await anon.auth.signInWithPassword({
          email,
          password: payload.password,
        });
      if (signError) return json({ error: signError.message }, 400);
      return json({
        user: sessionData.user,
        session: sessionData.session,
        username,
      });
    }

    if (action === "signin") {
      const { data, error } = await anon.auth.signInWithPassword({
        email,
        password: payload.password,
      });
      if (error) return json({ error: "Invalid username or password" }, 401);
      return json({
        user: data.user,
        session: data.session,
        username,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Auth failed";
    return json({ error: message }, 400);
  }
});
