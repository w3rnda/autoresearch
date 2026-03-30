import { clsx } from 'clsx'

export default function Select({ label, options = [], value, onChange, error, className = '', placeholder = 'Select...', id, disabled = false }) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      )}
      <select
        id={selectId}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={clsx(
          'block w-full rounded-lg border px-3 py-2 text-sm shadow-sm',
          'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100',
          'focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500',
          'dark:focus:ring-indigo-900/50 dark:focus:border-indigo-400',
          error ? 'border-red-300 dark:border-red-500/50' : 'border-gray-300 dark:border-gray-600',
          'disabled:bg-gray-50 disabled:text-gray-500 dark:disabled:bg-gray-900 dark:disabled:text-gray-500',
          className
        )}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
