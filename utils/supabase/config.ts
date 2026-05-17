type SupabasePublicConfig = {
  key: string;
  keySource:
    | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
  url: string;
  urlSource: "NEXT_PUBLIC_SUPABASE_URL";
};

type SupabaseServiceRoleConfig = {
  key: string;
  keySource: "SUPABASE_SERVICE_ROLE_KEY" | "SUPABASE_SECRET_KEY";
  url: string;
  urlSource: "SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_URL";
};

function getSupabasePublicUrl():
  | { value: string; source: "NEXT_PUBLIC_SUPABASE_URL" }
  | null {
  const nextPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (nextPublicUrl) {
    return { value: nextPublicUrl, source: "NEXT_PUBLIC_SUPABASE_URL" };
  }

  return null;
}

function getSupabaseServerUrl():
  | { value: string; source: "SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_URL" }
  | null {
  const serverUrl = process.env.SUPABASE_URL?.trim();
  if (serverUrl) {
    return { value: serverUrl, source: "SUPABASE_URL" };
  }

  return getSupabasePublicUrl();
}

function getSupabasePublicKey():
  | {
      value: string;
      source:
        | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
        | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
    }
  | null {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (publishableKey) {
    return {
      value: publishableKey,
      source: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    };
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (anonKey) {
    return { value: anonKey, source: "NEXT_PUBLIC_SUPABASE_ANON_KEY" };
  }

  return null;
}

function getSupabaseServiceRoleKey():
  | {
      value: string;
      source: "SUPABASE_SERVICE_ROLE_KEY" | "SUPABASE_SECRET_KEY";
    }
  | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceRoleKey) {
    return { value: serviceRoleKey, source: "SUPABASE_SERVICE_ROLE_KEY" };
  }

  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (secretKey) {
    return { value: secretKey, source: "SUPABASE_SECRET_KEY" };
  }

  return null;
}

function buildMissingPublicConfigMessage(context: string): string {
  return [
    `${context} requires Supabase runtime environment variables.`,
    "Expected URL: NEXT_PUBLIC_SUPABASE_URL.",
    "Expected public key: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  ].join(" ");
}

function buildMissingServiceRoleConfigMessage(context: string): string {
  return [
    `${context} requires Supabase server environment variables.`,
    "Expected URL: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.",
    "Expected service role key: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY.",
  ].join(" ");
}

export function getSupabasePublicConfig(context: string): SupabasePublicConfig {
  const url = getSupabasePublicUrl();
  const key = getSupabasePublicKey();

  if (!url || !key) {
    throw new Error(buildMissingPublicConfigMessage(context));
  }

  return {
    key: key.value,
    keySource: key.source,
    url: url.value,
    urlSource: url.source,
  };
}

export function getSupabaseServiceRoleConfig(
  context: string,
): SupabaseServiceRoleConfig {
  const url = getSupabaseServerUrl();
  const key = getSupabaseServiceRoleKey();

  if (!url || !key) {
    throw new Error(buildMissingServiceRoleConfigMessage(context));
  }

  return {
    key: key.value,
    keySource: key.source,
    url: url.value,
    urlSource: url.source,
  };
}

export function getSupabasePublicConfigOrNull(
  context: string,
): SupabasePublicConfig | null {
  try {
    return getSupabasePublicConfig(context);
  } catch (error) {
    console.error(error);
    return null;
  }
}
