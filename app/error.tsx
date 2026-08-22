"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error(error)
    }, [error])

    return (
        <div className="flex min-h-screen w-full flex-col items-center justify-center gap-6 bg-[#121212] p-4 text-white">
            <div className="flex max-w-md flex-col items-center gap-3 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 border border-red-500/25 text-red-400">
                    <AlertCircle className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-white">Something went wrong!</h2>
                <p className="text-sm leading-6 text-white/60">
                    {error.message || "An unexpected error occurred."}
                </p>
            </div>
            <Button
                onClick={() => reset()}
                className="inline-flex items-center gap-2 bg-[#8a2ae3] px-6 py-2.5 font-semibold text-white hover:bg-[#7822c7] transition-colors"
            >
                Try again
            </Button>
        </div>
    )
}
