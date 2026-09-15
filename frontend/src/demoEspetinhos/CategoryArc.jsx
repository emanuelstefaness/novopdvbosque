const positions = [
  { x: '8%', y: '54px' },
  { x: '29%', y: '22px' },
  { x: '54%', y: '10px' },
  { x: '79%', y: '35px' },
]

export default function CategoryArc({ categories, activeId, onSelect }) {
  return <nav className="skewer-category-arc" aria-label="Categorias de espetinhos">
    <div className="skewer-category-moon" aria-hidden="true" />
    {categories.map((category, index) => <button
      type="button"
      key={category.id}
      className="skewer-category"
      style={{ '--arc-x': positions[index].x, '--arc-y': positions[index].y }}
      aria-current={activeId === category.id ? 'true' : undefined}
      onClick={() => onSelect(category.id)}
    >
      <span className="skewer-category-icon" aria-hidden="true">{category.icon}</span>
      <span>{category.label}</span>
    </button>)}
  </nav>
}
