import ReactMarkdown from 'react-markdown';

// Untrusted model text must not load tracking images or execute embedded HTML.
// Navigation to journal evidence is provided by validated source buttons instead.
export default function Markdown({ children }: { children: string }) {
  return <ReactMarkdown skipHtml disallowedElements={['img']} components={{ a: ({ children: label }) => <span>{label}</span> }}>{children}</ReactMarkdown>;
}
