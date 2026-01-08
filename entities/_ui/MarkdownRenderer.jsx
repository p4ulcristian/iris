import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Styled markdown components for consistent rendering across the app
const markdownComponents = {
  h1: ({children}) => <h1 className="text-2xl font-bold text-white mb-4 pb-3 border-b border-white/10">{children}</h1>,
  h2: ({children}) => <h2 className="text-xl font-semibold text-white mt-8 mb-3">{children}</h2>,
  h3: ({children}) => <h3 className="text-lg font-semibold text-white mt-6 mb-2">{children}</h3>,
  p: ({children}) => <p className="text-white/80 leading-relaxed mb-4">{children}</p>,
  ul: ({children}) => <ul className="text-white/80 mb-4 ml-4 space-y-1 list-disc">{children}</ul>,
  ol: ({children}) => <ol className="text-white/80 mb-4 ml-4 space-y-1 list-decimal">{children}</ol>,
  li: ({children}) => <li className="text-white/80">{children}</li>,
  strong: ({children}) => <strong className="text-white font-semibold">{children}</strong>,
  em: ({children}) => <em className="text-white/70 italic">{children}</em>,
  a: ({href, children}) => <a href={href} className="text-purple-400 hover:text-purple-300 hover:underline">{children}</a>,
  code: ({inline, children}) => inline
    ? <code className="text-purple-300 bg-white/10 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
    : <code className="text-purple-300">{children}</code>,
  pre: ({children}) => <pre className="bg-black/50 border border-white/10 rounded-lg p-4 mb-4 overflow-x-auto font-mono text-sm">{children}</pre>,
  blockquote: ({children}) => <blockquote className="border-l-4 border-purple-500 pl-4 my-4 text-white/60 italic">{children}</blockquote>,
  hr: () => <hr className="border-white/10 my-8" />,
  table: ({children}) => <table className="w-full border-collapse mb-4 text-sm">{children}</table>,
  thead: ({children}) => <thead className="border-b border-white/20">{children}</thead>,
  tbody: ({children}) => <tbody>{children}</tbody>,
  tr: ({children}) => <tr className="border-b border-white/10">{children}</tr>,
  th: ({children}) => <th className="text-left text-white/90 font-semibold py-2 px-3">{children}</th>,
  td: ({children}) => <td className="text-white/70 py-2 px-3">{children}</td>,
}

export default function MarkdownRenderer({ content, className = '' }) {
  return (
    <div className={`markdown-body ${className}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {content}
      </Markdown>
    </div>
  )
}

export { markdownComponents }
