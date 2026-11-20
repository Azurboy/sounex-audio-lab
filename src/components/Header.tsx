export function Header() {
  return (
    <header className="top">
      <a className="brand" href="#top" aria-label="Sounex Lab，回到开头">
        <img src="/brand/mark.svg" width={27} height={27} alt="" />
        <span>
          sounex <span className="brand-lab">lab</span>
        </span>
      </a>
    </header>
  )
}
