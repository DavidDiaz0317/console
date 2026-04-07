/**
 * NPSModal — Net Promoter Score survey modal
 *
 * Displayed after key actions (workload deployed, cluster added, etc.).
 * The user selects a score 0–10 and optionally provides a reason.
 * Includes dismiss and "Don't show again" controls.
 */

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Send, CheckCircle2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { UseNPSResult } from '../../hooks/useNPS'

type NPSModalProps = Pick<UseNPSResult, 'isOpen' | 'markSubmitted' | 'dismiss' | 'neverShow'>

const SCORES = Array.from({ length: 11 }, (_, i) => i) // 0–10

function scoreLabel(score: number | null): string {
  if (score === null) return ''
  if (score <= 6) return 'Detractor'
  if (score <= 8) return 'Passive'
  return 'Promoter'
}

function scoreLabelColor(score: number | null): string {
  if (score === null) return ''
  if (score <= 6) return 'text-red-400'
  if (score <= 8) return 'text-yellow-400'
  return 'text-green-400'
}

function scoreButtonColor(score: number, selected: number | null): string {
  const isSelected = selected === score
  if (!isSelected) {
    return 'bg-secondary hover:bg-secondary/80 border border-border text-foreground'
  }
  if (score <= 6) return 'bg-red-500 border-red-500 text-white'
  if (score <= 8) return 'bg-yellow-500 border-yellow-500 text-white'
  return 'bg-green-500 border-green-500 text-white'
}

export function NPSModal({ isOpen, markSubmitted, dismiss, neverShow }: NPSModalProps) {
  const [selectedScore, setSelectedScore] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Keyboard: ESC to dismiss
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        dismiss()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, dismiss])

  const handleSubmit = useCallback(async () => {
    if (selectedScore === null) return
    setIsSubmitting(true)
    await markSubmitted(selectedScore, reason.trim())
    setSubmitted(true)
    setIsSubmitting(false)
  }, [selectedScore, reason, markSubmitted])

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
      aria-modal="true"
      role="dialog"
      aria-label="How likely are you to recommend KubeStellar?"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={dismiss}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md bg-background border border-border rounded-xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-border/50">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Share your feedback
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Help us improve KubeStellar Console
            </p>
          </div>
          <button
            onClick={dismiss}
            className="p-1.5 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {submitted ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="text-sm font-medium text-foreground mb-1">Thank you!</h3>
              <p className="text-xs text-muted-foreground">
                Your feedback helps us improve KubeStellar Console.
              </p>
            </div>
          ) : (
            <>
              {/* NPS Question */}
              <p className="text-sm text-foreground mb-3 font-medium">
                How likely are you to recommend KubeStellar Console to others?
              </p>

              {/* Score buttons */}
              <div className="flex gap-1.5 justify-between mb-2">
                {SCORES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedScore(s)}
                    className={cn(
                      'w-8 h-8 rounded-lg text-xs font-medium transition-all duration-150 shrink-0',
                      scoreButtonColor(s, selectedScore)
                    )}
                    aria-pressed={selectedScore === s}
                    aria-label={`Score ${s}`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Scale labels */}
              <div className="flex justify-between text-2xs text-muted-foreground mb-3">
                <span>Not likely</span>
                <span>Extremely likely</span>
              </div>

              {/* Score label */}
              {selectedScore !== null && (
                <p className={cn('text-xs font-medium text-center mb-3', scoreLabelColor(selectedScore))}>
                  {scoreLabel(selectedScore)}
                </p>
              )}

              {/* Optional reason */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  What is the main reason for your score?{' '}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Tell us more..."
                  rows={2}
                  maxLength={1000}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSubmit}
                  disabled={selectedScore === null || isSubmitting}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    selectedScore !== null
                      ? 'bg-purple-600 hover:bg-purple-700 text-white'
                      : 'bg-secondary text-muted-foreground cursor-not-allowed'
                  )}
                >
                  {isSubmitting ? (
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  Submit
                </button>
                <button
                  onClick={dismiss}
                  className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Later
                </button>
                <button
                  onClick={neverShow}
                  className="ml-auto text-2xs text-muted-foreground/60 hover:text-muted-foreground transition-colors underline underline-offset-2"
                >
                  Don't show again
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
