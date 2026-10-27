// Next.js mengingat hasil GET fetch yang identik selama satu render. Untuk database itu
// berbahaya: bacaan sesudah perubahan bisa mendapat hasil lama. Sinyal unik mematikan
// pengingatan tersebut, dan no-store mematikan cache data.
export const freshFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store", signal: init?.signal ?? new AbortController().signal });
