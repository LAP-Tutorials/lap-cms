"use client"

import { useEffect, useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from "react"
import { httpsCallable } from "firebase/functions"
import { functions } from "@/lib/firebase"

type MentionSuggestion = {
  handle: string
  name: string
  photoURL: string
}

type MentionTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string
  onChange: (value: string) => void
}

export function MentionTextarea({ value, onChange, className, ...props }: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [query, setQuery] = useState("")
  const [mentionStart, setMentionStart] = useState(-1)
  const [mentionEnd, setMentionEnd] = useState(-1)
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(false)

  const updateMentionContext = (nextValue: string, caret: number) => {
    const match = nextValue.slice(0, caret).match(/(?:^|[^a-z0-9_.-])@([a-z0-9_]{1,20})$/i)
    if (!match) {
      setQuery("")
      setSuggestions([])
      return
    }
    const nextQuery = match[1].toLowerCase()
    setQuery(nextQuery)
    setMentionStart(caret - nextQuery.length - 1)
    setMentionEnd(caret)
    setActiveIndex(0)
  }

  useEffect(() => {
    if (!query) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const search = httpsCallable<{ prefix: string }, { suggestions: MentionSuggestion[] }>(functions, "searchMentionHandles")
        const result = await search({ prefix: query })
        if (!cancelled) setSuggestions(result.data.suggestions)
      } catch (searchError) {
        console.error("Unable to search handles:", searchError)
        if (!cancelled) setSuggestions([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  const selectSuggestion = (suggestion: MentionSuggestion) => {
    if (mentionStart < 0 || mentionEnd < 0) return
    const inserted = `@${suggestion.handle} `
    const nextValue = `${value.slice(0, mentionStart)}${inserted}${value.slice(mentionEnd)}`
    const nextCaret = mentionStart + inserted.length
    onChange(nextValue)
    setQuery("")
    setSuggestions([])
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret)
    })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!suggestions.length) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % suggestions.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length)
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault()
      selectSuggestion(suggestions[activeIndex])
    } else if (event.key === "Escape") {
      setQuery("")
      setSuggestions([])
    }
  }

  return (
    <div className="relative">
      <textarea
        {...props}
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          updateMentionContext(event.target.value, event.target.selectionStart || event.target.value.length)
        }}
        onClick={(event) => updateMentionContext(event.currentTarget.value, event.currentTarget.selectionStart || 0)}
        onKeyDown={handleKeyDown}
        className={className}
        aria-autocomplete="list"
      />
      {query && (loading || suggestions.length > 0) ? (
        <div role="listbox" aria-label="Matching handles" className="absolute left-0 right-0 top-full z-30 max-h-52 overflow-y-auto border border-white/20 bg-[#171717] shadow-2xl">
          {loading && suggestions.length === 0 ? <p className="px-3 py-3 text-xs text-white/40">Finding handles…</p> : null}
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.handle}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => {
                event.preventDefault()
                selectSuggestion(suggestion)
              }}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${index === activeIndex ? "bg-white/10" : "hover:bg-white/[0.06]"}`}
            >
              {suggestion.photoURL ? <img src={suggestion.photoURL} alt="" className="h-7 w-7 object-cover" referrerPolicy="no-referrer" /> : <span className="flex h-7 w-7 items-center justify-center bg-white/10 text-xs uppercase text-white/50">{suggestion.handle.charAt(0)}</span>}
              <span className="min-w-0"><span className="block truncate text-sm font-medium">@{suggestion.handle}</span><span className="block truncate text-xs text-white/40">{suggestion.name}</span></span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
