export function useSearchParams() {
  return new URLSearchParams(globalThis.location?.search ?? "");
}
