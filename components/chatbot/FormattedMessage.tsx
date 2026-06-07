'use client';

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>;
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

export default function FormattedMessage({ text }: { text: string }) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

  if (!lines.length) return null;

  return (
    <div className="space-y-2 whitespace-normal leading-6">
      {lines.map((line, index) => {
        const bullet = line.match(/^[-*]\s+(.+)/);
        const numbered = line.match(/^(\d+)[.)]\s+(.+)/);
        const heading = line.match(/^#{1,3}\s+(.+)/);

        if (heading) {
          return <p key={index} className="font-semibold text-gray-900"><InlineText text={heading[1]} /></p>;
        }

        if (bullet) {
          return (
            <div key={index} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
              <p><InlineText text={bullet[1]} /></p>
            </div>
          );
        }

        if (numbered) {
          return (
            <div key={index} className="flex gap-2">
              <span className="shrink-0 font-semibold">{numbered[1]}.</span>
              <p><InlineText text={numbered[2]} /></p>
            </div>
          );
        }

        return <p key={index}><InlineText text={line} /></p>;
      })}
    </div>
  );
}
