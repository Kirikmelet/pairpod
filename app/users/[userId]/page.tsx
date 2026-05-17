import { UserProfilePage } from "@/components/user-profile-page";

type PageProps = {
  params: Promise<{
    userId: string;
  }>;
};

export function generateStaticParams(): Array<{ userId: string }> {
  return [{ userId: "__static-placeholder__" }];
}

export default async function Page({ params }: PageProps) {
  const { userId } = await params;
  return <UserProfilePage userId={userId} />;
}
