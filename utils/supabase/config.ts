type SupabasePublicConfig = {
  key: string;
  keySource: "NEXT_PUBLIC_SUPABASE_ANON_KEY" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
  url: string;
  urlSource: "NEXT_PUBLIC_SUPABASE_URL";
};

type SupabaseSecretConfig = {
  key: string;
  keySource: "SUPABASE_SECRET_KEY" | "SUPABASE_SERVICE_ROLE_KEY";
  url: string;
  urlSource: "NEXT_PUBLIC_SUPABASE_URL";
};

function getSupabaseUrl(): { value: string; source: "NEXT_PUBLIC_SUPABASE_URL" } | null {
  const nextPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (nextPublicUrl) {
    return { value: nextPublicUrl, source: "NEXT_PUBLIC_SUPABASE_URL" };
  }

  return null;
}

function getSupabasePublicKey():
  | {
      value: string;
      source:
        | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
        | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
    }
  | null {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (anonKey) {
    return { value: anonKey, source: "NEXT_PUBLIC_SUPABASE_ANON_KEY" };
  }

  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (publishableKey) {
    return {
      value: publishableKey,
      source: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    };
  }

  return null;
}

function getSupabaseSecretKey():
  | {
      value: string;
      source: "SUPABASE_SECRET_KEY" | "SUPABASE_SERVICE_ROLE_KEY";
    }
  | null {
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (secretKey) {
    return { value: secretKey, source: "SUPABASE_SECRET_KEY" };
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceRoleKey) {
    return { value: serviceRoleKey, source: "SUPABASE_SERVICE_ROLE_KEY" };
  }

  return null;
}

function buildMissingConfigMessage(context: string): string {
  return [
    `${context} requires Supabase runtime environment variables.`,
    "Expected URL: NEXT_PUBLIC_SUPABASE_URL.",
    "Expected public key: NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  ].join(" ");
}

function buildMissingSecretConfigMessage(context: string): string {
  return [
    `${context} requires Supabase server environment variables.`,
    "Expected URL: NEXT_PUBLIC_SUPABASE_URL.",
    "Expected secret key: SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.",
  ].join(" ");
}

export function getSupabasePublicConfig(context: string): SupabasePublicConfig {
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();

  if (!url || !key) {
    throw new Error(buildMissingConfigMessage(context));
  }

  return {
    key: key.value,
    keySource: key.source,
    url: url.value,
    urlSource: url.source,
  };
}

export function getSupabaseSecretConfig(context: string): SupabaseSecretConfig {
  const url = getSupabaseUrl();
  const key = getSupabaseSecretKey();

  if (!url || !key) {
    throw new Error(buildMissingSecretConfigMessage(context));
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
