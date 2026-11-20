import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  onSample?: () => void
}

export function AudioEntry({ children, onSample }: Props) {
  return (
    <main className="entry shell">
      <div className="entry-content">
        <h1><span>LLM 理解了文字，</span><wbr /><span>但声音呢？</span></h1>
        <div className="entry-input">{children}</div>
        {onSample && <button type="button" className="sample-link" onClick={onSample}>
          试用示例音频 <span aria-hidden="true">→</span>
        </button>}
      </div>
    </main>
  )
}
