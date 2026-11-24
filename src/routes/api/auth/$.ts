import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

function toAuthRequest(request: Request) {
  const url = new URL(request.url);
  if (!url.pathname.includes("/api/auth/oauth2/callback/")) return request;
  url.pathname = url.pathname.replace("/api/auth/oauth2/callback/", "/api/auth/callback/");
  return new Request(url, request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(toAuthRequest(request)),
      POST: ({ request }) => auth.handler(toAuthRequest(request)),
    },
  },
});
