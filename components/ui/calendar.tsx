"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import {
  DayPicker,
  getDefaultClassNames,
} from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "bg-background group/calendar p-2 md:p-3 [--cell-size:2rem] md:[--cell-size:--spacing(8)] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "flex gap-4 flex-col md:flex-row relative pb-10",
          defaultClassNames.months
        ),
        month: cn("flex flex-col w-full gap-4", defaultClassNames.month),
        nav: cn(
          "absolute bottom-0 w-full flex justify-between px-4 inset-x-0 pointer-events-none z-10",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) bg-transparent p-0 opacity-50 hover:opacity-100 text-white hover:text-white pointer-events-auto",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) bg-transparent p-0 opacity-50 hover:opacity-100 text-white hover:text-white pointer-events-auto",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex items-center justify-center h-(--cell-size) w-full px-(--cell-size) relative",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "w-full flex items-center text-sm font-medium justify-center h-(--cell-size) gap-1.5",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative has-focus:border-ring border border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] rounded-md",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "absolute bg-popover inset-0 opacity-0",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "select-none font-medium text-sm text-white",
          captionLayout === "label"
            ? "text-sm text-white"
            : "rounded-md pl-2 pr-1 flex items-center gap-1 text-sm h-8 text-white [&>svg]:text-white [&>svg]:size-3.5",
          defaultClassNames.caption_label
        ),
        table: "w-full border-collapse",
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "text-neutral-400 rounded-md flex-1 font-normal text-[0.8rem] select-none",
          defaultClassNames.weekday
        ),
        week: cn("flex w-full mt-2", defaultClassNames.week),
        week_number_header: cn(
          "select-none w-(--cell-size)",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "text-[0.8rem] select-none text-neutral-400",
          defaultClassNames.week_number
        ),
        day: cn(
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100",
          defaultClassNames.day
        ),
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-full w-full p-0 font-normal hover:bg-neutral-800 hover:text-white transition-colors",
          // General Selection (Single or Range) - Purple
          "aria-selected:bg-[#8a2be2] aria-selected:text-white aria-selected:hover:bg-[#8a2be2] aria-selected:hover:text-white",
          // Range Middle - Transparent Purple
           // Note: data-range-middle might be on the button itself in v9 if configured, but let's assume it might not and we rely on modifiers via classNames mostly.
           // However, if we put valid styles here that get merged, it's safer.
           "data-[range-middle]:!bg-[#8a2be2]/30 data-[range-middle]:text-white data-[range-middle]:rounded-none",
           // Range Start/End - Solid Purple
           "data-[range-start]:!bg-[#8a2be2] data-[range-start]:text-white data-[range-start]:rounded-l-md",
           "data-[range-end]:!bg-[#8a2be2] data-[range-end]:text-white data-[range-end]:rounded-r-md",
           // Today
           "[&:not([aria-selected])]:data-[today]:bg-accent [&:not([aria-selected])]:data-[today]:text-accent-foreground",
          defaultClassNames.day_button
        ),
        // Explicit modifiers mapping to classes - react-day-picker v9 uses these keys if they match modifier names
        range_start: "bg-[#8a2be2] text-white rounded-l-md hover:bg-[#8a2be2] hover:text-white",
        range_end: "bg-[#8a2be2] text-white rounded-r-md hover:bg-[#8a2be2] hover:text-white",
        range_middle: "bg-[#8a2be2]/30 text-white rounded-none hover:bg-[#8a2be2]/30 hover:text-white",
        selected: "bg-[#8a2be2] text-white hover:bg-[#8a2be2] hover:text-white",
        today: "bg-accent text-accent-foreground",
        outside: cn(
          "day-outside text-neutral-500 aria-selected:bg-transparent aria-selected:text-neutral-400",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-muted-foreground opacity-50",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      modifiersClassNames={{
        range_start: "bg-[#8a2be2] text-white rounded-l-md hover:bg-[#8a2be2] hover:text-white",
        range_end: "bg-[#8a2be2] text-white rounded-r-md hover:bg-[#8a2be2] hover:text-white",
        range_middle: "bg-[#8a2be2]/30 text-white rounded-none hover:bg-[#8a2be2]/30 hover:text-white",
        selected: "bg-[#8a2be2] text-white hover:bg-[#8a2be2] hover:text-white",
        today: "bg-accent text-accent-foreground"
      }}
      components={{
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4", className)} {...props} />
            )
          }
          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-4", className)}
                {...props}
              />
            )
          }
          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          )
        },
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">
                {children}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

export { Calendar }
