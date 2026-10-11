import { createFileRoute } from "@tanstack/react-router";
import { AanbiedingApp } from "@/components/aanbieding-app";

export const Route = createFileRoute("/")({
  component: AanbiedingApp,
});
