export function useSearchParams() {
  const location = globalThis.location;
  if (!location) {
    return new URLSearchParams();
  }

  const hash = location.hash.replace(/^#/, "");
  const hashQueryIndex = hash.indexOf("?");
  if (hashQueryIndex >= 0) {
    return new URLSearchParams(hash.slice(hashQueryIndex + 1));
  }

  return new URLSearchParams(location.search);
}
