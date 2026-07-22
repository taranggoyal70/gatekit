import { AcceptInvite } from "@/components/AcceptInvite";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <AcceptInvite token={token} />
    </div>
  );
}
