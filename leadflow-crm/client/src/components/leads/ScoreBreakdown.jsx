/**
 * ScoreBreakdown — displays engagement score, fit score, and composite score
 * as labeled progress bars. Used in LeadDetail sidebar.
 */
export default function ScoreBreakdown({ engagementScore = 0, fitScore = 0, score = 0 }) {
  function scoreColor(val) {
    if (val >= 60) return 'bg-emerald-500'
    if (val >= 30) return 'bg-amber-400'
    return 'bg-gray-300 dark:bg-gray-600'
  }

  function scoreLabelColor(val) {
    if (val >= 60) return 'text-emerald-600 dark:text-emerald-400'
    if (val >= 30) return 'text-amber-600 dark:text-amber-400'
    return 'text-gray-500 dark:text-gray-400'
  }

  const bars = [
    {
      label: 'Engagement',
      value: engagementScore,
      barClass: 'bg-indigo-500',
      hint: 'Email opens, clicks, meetings',
    },
    {
      label: 'Fit',
      value: fitScore,
      barClass: 'bg-violet-500',
      hint: 'Company, phone, industry, source',
    },
  ]

  return (
    <div className="space-y-4">
      {/* Composite score */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Composite Score</span>
        <span className={`text-2xl font-bold tabular-nums ${scoreLabelColor(score)}`}>{score}</span>
      </div>

      {/* Sub-scores */}
      {bars.map(({ label, value, barClass, hint }) => (
        <div key={label}>
          <div className="flex items-center justify-between mb-1">
            <div>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
              <span className="ml-1.5 text-[10px] text-gray-400 dark:text-gray-500">{hint}</span>
            </div>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{value}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barClass}`}
              style={{ width: `${Math.min(100, value)}%` }}
            />
          </div>
        </div>
      ))}

      {/* Score legend */}
      <div className="flex items-center gap-3 pt-1 text-[10px] text-gray-400 dark:text-gray-500">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />Cold &lt;30</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" />Warm 30–59</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />Hot ≥60</span>
      </div>
    </div>
  )
}
