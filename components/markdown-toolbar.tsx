// components/markdown-toolbar.tsx
"use client"

import type React from "react"
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  Code2,
  Quote,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface MarkdownToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>
  onInsert: (text: string, options?: { prefix?: string; suffix?: string }) => void
}

export function MarkdownToolbar({ textareaRef, onInsert }: MarkdownToolbarProps) {
  const insertMarkdown = (
    prefix: string,
    suffix = "",
    placeholder = "text",
  ) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = textarea.value.substring(start, end)
    const textToInsert = selectedText || placeholder

    onInsert(`${prefix}${textToInsert}${suffix}`)
  }

  const toolbarItems = [
    {
      icon: <Bold size={16} />,
      onClick: () => insertMarkdown("**", "**", "bold text"),
      title: "Bold",
    },
    {
      icon: <Italic size={16} />,
      onClick: () => insertMarkdown("*", "*", "italic text"),
      title: "Italic",
    },
    {
      icon: <Heading1 size={16} />,
      onClick: () => insertMarkdown("# ", "", "Heading 1"),
      title: "Heading 1",
    },
    {
      icon: <Heading2 size={16} />,
      onClick: () => insertMarkdown("## ", "", "Heading 2"),
      title: "Heading 2",
    },
    {
      icon: <Heading3 size={16} />,
      onClick: () => insertMarkdown("### ", "", "Heading 3"),
      title: "Heading 3",
    },
    {
      icon: <List size={16} />,
      onClick: () => insertMarkdown("- ", "", "List item"),
      title: "Unordered List",
    },
    {
      icon: <ListOrdered size={16} />,
      onClick: () => insertMarkdown("1. ", "", "List item"),
      title: "Ordered List",
    },
    {
      icon: <Quote size={16} />,
      onClick: () => insertMarkdown("> ", "", "Quote"),
      title: "Blockquote",
    },
    {
      icon: <Code2 size={16} />,
      onClick: () => insertMarkdown("```\n", "\n```", "code"),
      title: "Code Block",
    },
    {
      icon: <LinkIcon size={16} />,
      onClick: () => insertMarkdown("[", "](https://)", "link text"),
      title: "Link",
    },
    {
      icon: <ImageIcon size={16} />,
      onClick: () => insertMarkdown("![", "](https://)", "alt text"),
      title: "Image",
    },
  ]

  return (
    <div className="flex flex-wrap items-center gap-1 border border-white p-2 bg-[#1a1a1a]">
      {toolbarItems.map((item, index) => (
        <Button
          key={index}
          type="button"
          variant="ghost"
          size="icon"
          onClick={item.onClick}
          title={item.title}
          className="h-8 w-8"
        >
          {item.icon}
        </Button>
      ))}
    </div>
  )
}
