interface DescriptionInputProps {
  value: string;
  onChange: (value: string) => void;
  transactionType: 'expense' | 'income';
}

export function DescriptionInput({ value, onChange, transactionType }: DescriptionInputProps) {
  const placeholder = transactionType === 'income' 
    ? 'e.g. App royalties, PRY dividends'
    : 'e.g. Burger, Uber airport, Cinema';
    
  return (
    <div className="px-6 pb-6">
      <h3 className="text-neutral-700 font-semibold mb-2.5">Description</h3>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl bg-neutral-50 text-neutral-900 text-base placeholder:text-neutral-400 outline-none focus:bg-neutral-100 transition-colors"
      />
    </div>
  );
}