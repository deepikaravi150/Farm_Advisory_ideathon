import { redirect } from 'next/navigation';

export default async function ChatDetailPage(props: any) {
  const params = await props.params;
  redirect(`/dashboard?chat=${encodeURIComponent(params.id)}`);
}
