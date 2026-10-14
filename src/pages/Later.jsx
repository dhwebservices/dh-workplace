// Sections in the spec that aren't built yet. Plain and honest, no filler graphics.
export default function Later({ title, body }) {
  return (
    <main className="page">
      <div className="page-head"><h1>{title}</h1></div>
      <div className="empty-state"><h2>Not ready yet</h2><p>{body}</p></div>
    </main>
  )
}
