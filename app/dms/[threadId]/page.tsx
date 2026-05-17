import { DmPage } from "@/components/dm-page";

const AI_ASSISTANT_THREAD_ID = "pairpod-ai-assistant";

type PageProps = {
  params: Promise<{
    threadId: string;
  }>;
};

export function generateStaticParams(): Array<{ threadId: string }> {
  return [
    { threadId: "__static-placeholder__" },
    { threadId: AI_ASSISTANT_THREAD_ID },
  ];
}

export default async function Page({ params }: PageProps) {
  const { threadId } = await params;
  return <DmPage threadId={threadId} />;
}
