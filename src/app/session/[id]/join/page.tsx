import { redirect } from "next/navigation";

/** Invite links of the form /session/:id/join land in the same room. */
export default async function JoinRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/session/${id.toLowerCase()}`);
}
