import { clsx } from 'clsx'

export default function Input({
  label, error, hint, id, className = '', type = 'text', ...props
}) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        className={clsx(
          'block w-full rounded-lg border px-3 py-2 text-sm shadow-sm',
          'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100',
          'placeholder:text-gray-400 dark:placeholder:text-gray-500',
          'focus:outline-none focus:ring-2 focus:ring-offset-0',
          error
            ? 'border-red-300 focus:border-red-500 focus:ring-red-200 dark:border-red-500/50 dark:focus:ring-red-900/50'
            : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-200 dark:border-gray-600 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/50',
          'disabled:bg-gray-50 disabled:text-gray-500 dark:disabled:bg-gray-900 dark:disabled:text-gray-500',
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  )
}
