import Icon from '../components/Icon'

const positions = [
  { x: '8%', y: '44px' },
  { x: '30%', y: '23px' },
  { x: '52%', y: '15px' },
  { x: '74%', y: '31px' },
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
      <span className="skewer-category-icon" aria-hidden="true">
        {category.image
          ? <img src={category.image} alt="" />
          : <Icon name={category.icon} size={19} />}
      </span>
      <span>{category.label}</span>
    </button>)}
  </nav>
}
