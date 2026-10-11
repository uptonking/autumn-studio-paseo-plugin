import * as React from "react"

import { Button } from "../components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "../components/ui/dialog"
import { Input } from "../components/ui/input"
import { IconPlaceholder } from "../icon-placeholder"
import { cn } from "../lib/utils"
import {
  calendarDayKey,
  DATE_RANGE_DIALOG_PRESETS,
  dateRangePresetRange,
  formatDateInputValue,
  parseDateInputValue,
  WEEKDAY_LABELS,
} from "./filter-types"

function FileSystemRangeCalendar({
  onSelect,
  range,
}: {
  onSelect: (range: { from?: Date; to?: Date }) => void
  range: { from?: Date; to?: Date }
}) {
  const [viewMonth, setViewMonth] = React.useState(() => {
    const base = range.from ?? new Date()

    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const months = [
    viewMonth,
    new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1),
  ]
  const fromKey = range.from ? calendarDayKey(range.from) : null
  const toKey = range.to ? calendarDayKey(range.to) : null
  const todayKey = calendarDayKey(new Date())

  const handleDayClick = (day: Date) => {
    if (!range.from || range.to) {
      onSelect({ from: day })
    } else if (calendarDayKey(day) < calendarDayKey(range.from)) {
      onSelect({ from: day, to: range.from })
    } else {
      onSelect({ from: range.from, to: day })
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Previous month"
        onClick={() =>
          setViewMonth(
            (previous) =>
              new Date(previous.getFullYear(), previous.getMonth() - 1, 1)
          )
        }
        className="absolute top-0 left-0 flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <IconPlaceholder
          lucide="ChevronLeft"
          tabler="IconChevronLeft"
          hugeicons="ArrowLeft01Icon"
          phosphor="CaretLeftIcon"
          remixicon="RiArrowLeftSLine"
          className="size-4"
        />
      </button>
      <button
        type="button"
        aria-label="Next month"
        onClick={() =>
          setViewMonth(
            (previous) =>
              new Date(previous.getFullYear(), previous.getMonth() + 1, 1)
          )
        }
        className="absolute top-0 right-0 flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <IconPlaceholder
          lucide="ArrowRight"
          tabler="IconArrowRight"
          hugeicons="ArrowRight01Icon"
          phosphor="ArrowRightIcon"
          remixicon="RiArrowRightLine"
          className="size-4"
        />
      </button>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {months.map((month, monthIndex) => {
          const firstWeekday = month.getDay()
          const dayCount = new Date(
            month.getFullYear(),
            month.getMonth() + 1,
            0
          ).getDate()
          const cells = [
            ...Array.from({ length: firstWeekday }, () => null),
            ...Array.from(
              { length: dayCount },
              (_, index) =>
                new Date(month.getFullYear(), month.getMonth(), index + 1)
            ),
          ]

          return (
            <div
              key={`${month.getFullYear()}-${month.getMonth()}`}
              className={cn(monthIndex === 1 && "max-sm:hidden")}
            >
              <div className="text-center text-sm leading-6 font-medium">
                {month.toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </div>
              <div className="mt-1 grid grid-cols-7 text-center text-xs text-muted-foreground">
                {WEEKDAY_LABELS.map((weekday) => (
                  <span key={weekday} className="h-6 leading-6">
                    {weekday}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-px">
                {cells.map((day, cellIndex) => {
                  if (!day) return <span key={cellIndex} />

                  const dayKey = calendarDayKey(day)
                  const isFrom = dayKey === fromKey
                  const isTo = dayKey === toKey
                  const isWithinRange =
                    fromKey !== null &&
                    toKey !== null &&
                    dayKey > fromKey &&
                    dayKey < toKey

                  return (
                    <button
                      key={cellIndex}
                      type="button"
                      onClick={() => handleDayClick(day)}
                      className={cn(
                        "flex h-7 items-center justify-center rounded-md text-xs tabular-nums transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                        isWithinRange && "rounded-none bg-accent",
                        (isFrom || isTo) &&
                          "bg-primary text-primary-foreground hover:bg-primary",
                        isFrom &&
                          toKey !== null &&
                          fromKey !== toKey &&
                          "rounded-r-none",
                        isTo && fromKey !== toKey && "rounded-l-none",
                        dayKey === todayKey &&
                          !isFrom &&
                          !isTo &&
                          "font-semibold text-primary"
                      )}
                    >
                      {day.getDate()}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function FileSystemDateRangeDialog({
  initialRange,
  onApply,
  onClose,
}: {
  initialRange?: { from: Date; to: Date }
  onApply: (from: Date, to: Date) => void
  onClose: () => void
}) {
  const [range, setRange] = React.useState<{ from?: Date; to?: Date }>(
    () => initialRange ?? {}
  )
  const [fromInput, setFromInput] = React.useState(() =>
    formatDateInputValue(initialRange?.from)
  )
  const [toInput, setToInput] = React.useState(() =>
    formatDateInputValue(initialRange?.to)
  )

  const selectRange = (next: { from?: Date; to?: Date }) => {
    setRange(next)
    if (next.from) setFromInput(formatDateInputValue(next.from))
    if (next.to) setToInput(formatDateInputValue(next.to))
  }

  const dateField = (
    label: string,
    value: string,
    onChange: (value: string) => void
  ) => (
    <div className="flex flex-1 flex-col gap-1.5">
      <span className="text-xs font-medium">{label}</span>
      <div className="relative flex items-center">
        <IconPlaceholder
          lucide="Calendar"
          tabler="IconCalendar"
          hugeicons="Calendar03Icon"
          phosphor="CalendarIcon"
          remixicon="RiCalendarLine"
          className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground"
        />
        <Input
          type="text"
          value={value}
          placeholder="YYYY-MM-DD"
          aria-label={`${label} date`}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 pl-8 sm:h-8"
        />
      </div>
    </div>
  )

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="w-[30rem] max-w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>Custom date range</DialogTitle>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-4">
          <div className="flex gap-3">
            {dateField("From", fromInput, (value) => {
              setFromInput(value)

              const parsed = parseDateInputValue(value)

              if (parsed)
                setRange((previous) => ({ ...previous, from: parsed }))
            })}
            {dateField("To", toInput, (value) => {
              setToInput(value)

              const parsed = parseDateInputValue(value)

              if (parsed) setRange((previous) => ({ ...previous, to: parsed }))
            })}
          </div>
          <FileSystemRangeCalendar range={range} onSelect={selectRange} />
          <div className="grid grid-cols-3 gap-2">
            {DATE_RANGE_DIALOG_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => selectRange(dateRangePresetRange(preset))}
              >
                {preset}
              </Button>
            ))}
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!range.from || !range.to}
            onClick={() => {
              if (!range.from || !range.to) return

              const from = new Date(range.from)
              const to = new Date(range.to)

              from.setHours(0, 0, 0, 0)
              to.setHours(23, 59, 59, 999)
              onApply(from, to)
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
