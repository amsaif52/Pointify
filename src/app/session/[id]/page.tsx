import type { Metadata } from "next";
import Room from "@/components/Room";

export const metadata: Metadata = {
  title: "Session — Pointify",
  description: "Join the planning poker room and vote with your team.",
};

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Room sessionId={id.toLowerCase()} />;
}
