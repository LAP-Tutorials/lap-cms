"use client"

import * as React from "react"
import { useState, useRef, useEffect } from "react"
import { ChevronDown, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"

export const DEFAULT_MODERATION_REASONS = [
  "Harassment or disrespectful behavior",
  "Hate speech, discrimination, or slurs",
  "Spam, scams, or promotional links",
  "Inappropriate, obscene, or NSFW content",
  "Impersonation or misleading identity",
  "Misinformation or deceptive advice",
  "Threats of violence, harm, or illegal activity",
  "Repeated off-topic disruption or trolling",
  "Severe or repeated Community Guidelines violations",
] as const

interface ReasonComboboxProps {
  value: string
  onChange: (val: string) => void
  options?: readonly string[] | string[]
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function ReasonCombobox({
  value,
  onChange,
  options = DEFAULT_MODERATION_REASONS,
  placeholder = "Select or type a reason...",
  className,
  disabled = false,
}: ReasonComboboxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filter options based on typed input
  const filteredOptions = React.useMemo(() => {
    const query = (value || "").trim().toLowerCase()
    if (!query) return Array.from(options)
    return options.filter((opt) => opt.toLowerCase().includes(query))
  }, [options, value])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSelect = (option: string) => {
    onChange(option)
    setIsOpen(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        setHighlightedIndex(0)
      } else {
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        )
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        setHighlightedIndex(filteredOptions.length - 1)
      } else {
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        )
      }
    } else if (e.key === "Enter") {
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        e.preventDefault()
        handleSelect(filteredOptions[highlightedIndex])
      } else {
        setIsOpen(false)
      }
    } else if (e.key === "Escape") {
      setIsOpen(false)
    }
  }

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setIsOpen(true)
            setHighlightedIndex(-1)
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full bg-black/60 border border-white/15 px-3 py-2 pr-16 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#8a2ae3] focus:ring-1 focus:ring-[#8a2ae3] rounded-none transition-colors"
        />

        <div className="absolute right-1 flex items-center gap-0.5">
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onChange("")
                inputRef.current?.focus()
              }}
              tabIndex={-1}
              className="p-1 text-white/40 hover:text-white transition-colors"
              title="Clear text"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setIsOpen((prev) => !prev)
              inputRef.current?.focus()
            }}
            tabIndex={-1}
            disabled={disabled}
            className="p-1 text-white/50 hover:text-white transition-colors"
            title="Toggle reasons dropdown"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                isOpen && "rotate-180"
              )}
            />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-[1100] mt-1 max-h-60 overflow-y-auto border border-white/20 bg-[#161616] p-1 shadow-2xl shadow-black/80">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, index) => {
              const isSelected = opt.toLowerCase() === (value || "").trim().toLowerCase()
              const isHighlighted = index === highlightedIndex
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors rounded-none font-normal",
                    isHighlighted
                      ? "bg-[#8a2ae3]/20 text-white"
                      : isSelected
                      ? "bg-white/10 text-white font-medium"
                      : "text-white/80 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <span className="truncate pr-2">{opt}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[#8a2ae3]" />}
                </button>
              )
            })
          ) : (
            <div className="p-2.5 text-left text-xs">
              <span className="text-white/40 block mb-0.5 text-[11px] font-mono">Custom Reason:</span>
              <span className="text-white/90 font-medium block truncate">
                &ldquo;{value}&rdquo;
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
