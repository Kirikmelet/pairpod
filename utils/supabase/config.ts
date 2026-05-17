type SupabasePublicConfig = {
  key: string;
  keySource: "NEXT_PUBLIC_SUPABASE_ANON_KEY" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
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

function buildMissingConfigMessage(context: string): string {
  return [
    `${context} requires Supabase runtime environment variables.`,
    "Expected URL: NEXT_PUBLIC_SUPABASE_URL.",
    "Expected public key: NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
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
