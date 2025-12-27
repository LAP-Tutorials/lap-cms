import * as React from "react"
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerWithRangeProps {
  className?: string
  date: DateRange | undefined
  setDate: (date: DateRange | undefined) => void
}

export function DatePickerWithRange({
  className,
  date,
  setDate,
}: DatePickerWithRangeProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [tempDate, setTempDate] = React.useState<DateRange | undefined>(date)
  const [activeInput, setActiveInput] = React.useState<'start' | 'end' | null>(null)

  // Sync tempDate when popover opens
  React.useEffect(() => {
    if (isOpen) {
        setTempDate(date)
        setActiveInput(null)
    }
  }, [isOpen, date])

  const handleSelect = (range: DateRange | undefined, selectedDay: Date) => {
    if (activeInput === 'start') {
        const currentEnd = tempDate?.to
        if (currentEnd && selectedDay > currentEnd) {
             setTempDate({ from: selectedDay, to: undefined })
        } else {
             setTempDate({ from: selectedDay, to: currentEnd })
        }
    } else if (activeInput === 'end') {
        const currentStart = tempDate?.from
        if (currentStart) {
            if (selectedDay < currentStart) {
                 setTempDate({ from: selectedDay, to: undefined })
                 setActiveInput('start') 
            } else {
                 setTempDate({ from: currentStart, to: selectedDay })
            }
        } else {
            setTempDate({ from: selectedDay, to: undefined })
            setActiveInput('start')
        }
    } else {
        setTempDate(range)
    }
  }

  const applyChanges = () => {
    setDate(tempDate)
    setIsOpen(false)
  }

  const cancelChanges = () => {
      setIsOpen(false)
  }
  
  const presets = [
    { label: "Today", getValue: () => ({ from: new Date(), to: new Date() }) },
    { label: "Yesterday", getValue: () => { const d = subDays(new Date(), 1); return { from: d, to: d } } },
    { label: "This week (Sun - Today)", getValue: () => { const today = new Date(); return { from: subDays(today, today.getDay()), to: today } } },
    { label: "Last 7 days", getValue: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
    { label: "Last 14 days", getValue: () => ({ from: subDays(new Date(), 13), to: new Date() }) },
    { label: "Last 30 days", getValue: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
    { label: "Last 90 days", getValue: () => ({ from: subDays(new Date(), 89), to: new Date() }) },
    { label: "This month", getValue: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
    { label: "Last month", getValue: () => { const d = subDays(new Date(), 30); return { from: startOfMonth(d), to: endOfMonth(d) } } },
    { label: "This year", getValue: () => ({ from: startOfYear(new Date()), to: new Date() }) },
    { label: "Last year", getValue: () => { const d = subDays(new Date(), 365); return { from: startOfYear(d), to: endOfYear(d) } } },
  ]

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-[260px] justify-start text-left font-normal border-neutral-800 bg-transparent hover:bg-neutral-900 text-white rounded-none",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} -{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-[#0a0a0a] border-neutral-800 rounded-none z-[1001] flex" align="end">
            <div className="border-r border-neutral-800 w-[180px] p-2 space-y-1">
                {presets.map((preset) => (
                    <button
                        key={preset.label}
                        onClick={() => {
                            setTempDate(preset.getValue());
                            setActiveInput(null); 
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-900 hover:text-white rounded-sm transition-colors"
                    >
                        {preset.label}
                    </button>
                ))}
            </div>

            <div className="flex flex-col">
                <div className="flex items-center justify-between p-3 border-b border-neutral-800 space-x-4">
                    <div 
                        className="flex flex-col space-y-1 cursor-pointer group"
                        onClick={() => setActiveInput('start')}
                    >
                        <span className={cn(
                            "text-xs uppercase font-semibold transition-colors",
                            activeInput === 'start' ? "text-[#8a2be2]" : "text-neutral-500 group-hover:text-neutral-300"
                        )}>Start Date</span>
                        <div className={cn(
                            "text-sm font-medium text-white bg-neutral-900 px-3 py-1.5 border min-w-[120px] transition-colors",
                            activeInput === 'start' ? "border-[#8a2be2]" : "border-neutral-800 group-hover:border-neutral-700"
                        )}>
                            {tempDate?.from ? format(tempDate.from, "MMM dd, yyyy") : "Select date"}
                        </div>
                    </div>
                    <div 
                        className="flex flex-col space-y-1 cursor-pointer group"
                        onClick={() => setActiveInput('end')}
                    >
                        <span className={cn(
                            "text-xs uppercase font-semibold transition-colors",
                            activeInput === 'end' ? "text-[#8a2be2]" : "text-neutral-500 group-hover:text-neutral-300"
                        )}>End Date</span>
                        <div className={cn(
                            "text-sm font-medium text-white bg-neutral-900 px-3 py-1.5 border min-w-[120px] transition-colors",
                            activeInput === 'end' ? "border-[#8a2be2]" : "border-neutral-800 group-hover:border-neutral-700"
                        )}>
                            {tempDate?.to ? format(tempDate.to, "MMM dd, yyyy") : "Select date"}
                        </div>
                    </div>
                </div>
                <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={tempDate?.from}
                    selected={tempDate}
                    onSelect={handleSelect}
                    numberOfMonths={2}
                />
                <div className="p-3 border-t border-neutral-800 flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={cancelChanges} className="text-neutral-400 hover:text-white">
                        Cancel
                    </Button>
                    <Button size="sm" onClick={applyChanges} className="bg-[#8a2be2] hover:bg-[#7a26c9] text-white">
                        Apply
                    </Button>
                </div>
            </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
