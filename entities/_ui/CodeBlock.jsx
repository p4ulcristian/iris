import { useState } from 'react'
import { Highlight, themes } from 'prism-react-renderer'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy, faCheck } from '@fortawesome/free-solid-svg-icons'

export default function CodeBlock({ children, language = '', showLineNumbers = true }) {
  const [copied, setCopied] = useState(false)
  const code = String(children).replace(/\n$/, '')

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group mb-4">
      {/* Header with language label and copy button */}
      <div className="flex items-center justify-between bg-black/60 border border-white/10 border-b-0 rounded-t-lg px-3 py-1.5">
        <span className="text-xs text-white/50 font-mono">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="text-white/40 hover:text-white/80 transition-colors p-1"
          title="Copy code"
        >
          <FontAwesomeIcon
            icon={copied ? faCheck : faCopy}
            className={`text-xs ${copied ? 'text-green-400' : ''}`}
          />
        </button>
      </div>

      {/* Code block with syntax highlighting */}
      <Highlight theme={themes.nightOwl} code={code} language={language || 'text'}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className="bg-black/50 border border-white/10 border-t-0 rounded-b-lg p-4 overflow-x-auto font-mono text-sm m-0"
            style={{ ...style, background: 'transparent' }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })} className="table-row">
                {showLineNumbers && (
                  <span className="table-cell pr-4 text-white/20 select-none text-right w-8">
                    {i + 1}
                  </span>
                )}
                <span className="table-cell">
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </span>
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  )
}
