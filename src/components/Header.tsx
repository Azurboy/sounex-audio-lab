import brandMark from '/brand/mark.svg?url'
type Props = {
  siteNavigation: boolean
  onHome: () => void
  action?: { label: string; onClick: () => void }
}

export function Header({ onHome, action, siteNavigation }: Props) {
  return (
    <header className="top">
      <a className="brand" href="#top" aria-label="Sounex Lab 首页" onClick={event => { event.preventDefault(); onHome() }}>
        <img src={brandMark} width={27} height={27} alt="" />
        <span>sounex <span className="brand-lab">lab</span></span>
      </a>
      <div className="header-links">
        {siteNavigation && <nav aria-label="主导航"><a href="#metrics">指标库</a><a href="#api">API</a></nav>}
        {action && <button type="button" className="header-action" onClick={action.onClick}>{action.label}</button>}
      </div>
    </header>
  )
}
