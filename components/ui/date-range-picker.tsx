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

  const handleSelect = (newDate: DateRange | undefined) => {
    if (!newDate) {
        setTempDate(undefined)
        return
    }

    if (activeInput === 'start') {
        // If editing start date
        // If user picked a range (start+end), use that new range's start
        // Ideally they pick a single date.
        // If we only possess 'from' from the new selection, use it.
        // We want to keep existing 'to'.
        
        // However, react-day-picker 'range' mode always returns a range object.
        // If we clicked one day, it might be { from: D, to: undefined } or { from: D, to: D } depending.
        // Let's assume user ignores the range drag behavior if they explicitly clicked "Start Date" box.
        
        let newStart = newDate.from
        // If new start is after existing end, we might need to reset end or swap.
        // Simple logic: Update Start. If Start > End, clear End.
        
        const currentEnd = tempDate?.to
        
        if (newStart && currentEnd && newStart > currentEnd) {
             setTempDate({ from: newStart, to: undefined })
        } else {
             setTempDate({ from: newStart, to: currentEnd })
        }
    } else if (activeInput === 'end') {
        // Editing end date
        // Use new date as end.
        // If user selects a range, we typically allow standard behavior, but here we want strict 'end' updates?
        // Actually, allowing standard react-day-picker behavior is usually best unless specific constraint.
        // But user asked "have them be able to click on what they want to change".
        
        // If I click a date while "End Date" is active:
        // New date should becomes 'to'. 'from' stays same.
        
        // newDate.from is usually the clicked date if it's a single click.
        const pickedDate = newDate.to || newDate.from // Determine what was likely clicked
        
        const currentStart = tempDate?.from
        
        if (pickedDate && currentStart) {
             if (pickedDate < currentStart) {
                 // If picked end date is before start, maybe swap? Or just set start?
                 // Let's set it as start and clear end to be safe/standard
                  setTempDate({ from: pickedDate, to: undefined })
             } else {
                 setTempDate({ from: currentStart, to: pickedDate })
             }
        } else {
             setTempDate(newDate)
        }
    } else {
        // Standard behavior
        setTempDate(newDate)
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
            {/* Sidebar Presets */}
            <div className="border-r border-neutral-800 w-[180px] p-2 space-y-1">
                {presets.map((preset) => (
                    <button
                        key={preset.label}
                        onClick={() => {
                            setTempDate(preset.getValue());
                            setActiveInput(null); // Reset active input on preset click
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-900 hover:text-white rounded-sm transition-colors"
                    >
                        {preset.label}
                    </button>
                ))}
            </div>

            {/* Calendar Area */}
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
