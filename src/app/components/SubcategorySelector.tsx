interface SubcategorySelectorProps {
  subcategories: string[];
  selectedSubcategory: string | null;
  onSelectSubcategory: (subcategory: string | null) => void;
}

export function SubcategorySelector({ subcategories, selectedSubcategory, onSelectSubcategory }: SubcategorySelectorProps) {
  if (subcategories.length === 0) return null;

  return (
    <div className="px-6 pb-6">
      <h3 className="text-neutral-500 text-sm mb-2.5">Subcategory</h3>
      
      <div className="flex flex-wrap gap-2">
        {subcategories.map((subcategory) => (
          <button
            key={subcategory}
            onClick={() => onSelectSubcategory(subcategory === selectedSubcategory ? null : subcategory)}
            className={`px-3.5 py-1.5 rounded-lg text-sm ${
              selectedSubcategory === subcategory
                ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200'
                : 'bg-neutral-50/80 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-600'
            }`}
            style={{ 
              transition: 'background-color 0.15s ease, color 0.15s ease',
              transform: 'translateZ(0)',
              WebkitFontSmoothing: 'antialiased',
              backfaceVisibility: 'hidden'
            }}
          >
            <span style={{ transform: 'translateZ(0)', display: 'inline-block' }}>
              {subcategory}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}