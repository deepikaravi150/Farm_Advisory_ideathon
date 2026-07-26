import ChatPanel from '@/components/chatbot/ChatPanel';

export default async function ChatPage(props: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const mode = searchParams.mode === 'checkin' ? 'checkin' : 'normal';

  return (
    <div className="h-[calc(100dvh-4.5rem)]">
      <ChatPanel mode={mode} />
    </div>
  );
}
