"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface ArticleContentProps {
  htmlContent: string;
}

type TocItem = {
  id: string;
  title: string;
  level: number;
  children: TocItem[];
};

function buildTocTree(flatItems: Array<Omit<TocItem, "children">>): TocItem[] {
  const root: TocItem[] = [];
  const stack: TocItem[] = [];

  for (const flat of flatItems) {
    const node: TocItem = { ...flat, children: [] };

    while (stack.length > 0 && node.level <= stack[stack.length - 1].level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  }

  return root;
}

const ArticleContent: React.FC<ArticleContentProps> = ({ htmlContent }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tocTree, setTocTree] = useState<TocItem[]>([]);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const headingMapRef = useRef<Map<string, HTMLHeadingElement>>(new Map());

  const tocNodeStorageKey = useMemo(() => "lap:toc:collapsed:nodes", []);

  async function copyTextToClipboard(text: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);

    if (!ok) {
      throw new Error("Copy failed");
    }
  }

  // Icons for the copy button
  const copySvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
  const checkSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(tocNodeStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setCollapsedIds(new Set(parsed as string[]));
        }
      }
    } catch {
      // Ignore storage failures
    }
  }, [tocNodeStorageKey]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // Build TOC from headings.
    headingMapRef.current.clear();
    const headings = Array.from(
      root.querySelectorAll("h1, h2, h3, h4")
    ) as HTMLHeadingElement[];

    const flat: Array<Omit<TocItem, "children">> = [];

    for (const heading of headings) {
      const title = (heading.textContent ?? "").trim();
      if (!title) continue;

      const level = Number(heading.tagName.replace("H", ""));
      const id = heading.id;

      if (id) {
        headingMapRef.current.set(id, heading);
        flat.push({ id, title, level });
      }
    }

    setTocTree(buildTocTree(flat));
  }, [htmlContent]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!tocTree.length) return;

    const raw = window.location.hash;
    if (!raw || raw.length < 2) return;
    const id = decodeURIComponent(raw.slice(1));

    window.requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) {
        const headerOffset = 120;
        const elementPosition = el.getBoundingClientRect().top + window.scrollY;
        const offsetPosition = elementPosition - headerOffset;
        window.scrollTo({ top: offsetPosition, behavior: "smooth" });
      }
    });
  }, [tocTree]);

  // Event delegation for copy buttons
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const handleCopyClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const button = target.closest(".copy-btn") as HTMLButtonElement;

      if (!button || !root.contains(button)) return;

      e.preventDefault();
      e.stopPropagation();

      const code = button.getAttribute("data-code");
      const codeText =
        code ||
        button.nextElementSibling?.querySelector("code")?.textContent ||
        "";

      if (!codeText) return;

      try {
        await copyTextToClipboard(codeText);
        button.innerHTML = checkSvg;
        button.setAttribute("title", "Copied");

        setTimeout(() => {
          button.innerHTML = copySvg;
          button.setAttribute("title", "Copy");
        }, 1500);
      } catch (err) {
        console.error("Failed to copy:", err);
        button.setAttribute("title", "Copy failed");
      }
    };

    root.addEventListener("click", handleCopyClick);
    return () => {
      root.removeEventListener("click", handleCopyClick);
    };
  }, [htmlContent]);

  const handleTocToggle = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      try {
        window.localStorage.setItem(
          tocNodeStorageKey,
          JSON.stringify(Array.from(next))
        );
      } catch {
        // Ignore storage failures
      }
      return next;
    });
  };

  return (
    <div className="grid md:grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px] gap-0 md:gap-8 lg:gap-12 w-full max-w-[90rem] mx-auto mt-6 md:mt-24 mb-10 px-4">
      <MobileToc
        items={tocTree}
        collapsedIds={collapsedIds}
        onToggle={handleTocToggle}
      />

      <div className="markdown-body w-full min-w-0" ref={containerRef}>
        <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
      </div>

      {tocTree.length > 0 ? (
        <aside className="hidden lg:block shrink-0 self-start sticky top-16">
          <div className="p-4">
            <p className="uppercase font-semibold text-white">Table of Content</p>

            <nav className="mt-4 max-h-[calc(100vh-12rem)] overflow-auto">
              <TocList
                items={tocTree}
                collapsedIds={collapsedIds}
                onToggle={handleTocToggle}
              />
            </nav>
          </div>
        </aside>
      ) : null}
    </div>
  );
};

function MobileToc({
  items,
  collapsedIds,
  onToggle,
}: {
  items: TocItem[];
  collapsedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="lg:hidden border border-white p-4 mb-5">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full font-semibold uppercase text-white"
      >
        Table of Content
        <span>{isOpen ? "−" : "+"}</span>
      </button>

      {isOpen && (
        <nav className="mt-4 max-h-96 overflow-auto">
          <TocList
            items={items}
            collapsedIds={collapsedIds}
            onToggle={onToggle}
          />
        </nav>
      )}
    </div>
  );
}

function TocList({
  items,
  collapsedIds,
  onToggle,
}: {
  items: TocItem[];
  collapsedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="space-y-2">
          <div className="flex items-start gap-2">
            {item.children.length > 0 ? (
              <button
                type="button"
                className="mt-[2px] text-sm w-5 text-left text-white"
                aria-label={collapsedIds.has(item.id) ? "Expand" : "Collapse"}
                aria-expanded={!collapsedIds.has(item.id)}
                onClick={() => onToggle(item.id)}
              >
                {collapsedIds.has(item.id) ? "▸" : "▾"}
              </button>
            ) : (
              <span className="mt-[2px] w-5" aria-hidden="true"></span>
            )}

            <a
              href={`#${item.id}`}
              className="text-left w-full hover:underline cursor-pointer pointer-events-auto text-white/70 hover:text-white transition-colors"
              onClick={(e) => {
                e.preventDefault();
                const element = document.getElementById(item.id);
                if (element) {
                  const headerOffset = 120;
                  const elementPosition =
                    element.getBoundingClientRect().top + window.scrollY;
                  const offsetPosition = elementPosition - headerOffset;

                  window.scrollTo({
                    top: offsetPosition,
                    behavior: "smooth",
                  });
                  window.history.pushState(null, "", `#${item.id}`);
                }
              }}
            >
              <span
                className={
                  item.level === 2
                    ? "text-base font-bold"
                    : item.level === 3
                    ? "text-sm font-semibold"
                    : "text-sm opacity-90"
                }
              >
                {item.title}
              </span>
            </a>
          </div>

          {item.children.length > 0 && !collapsedIds.has(item.id) ? (
            <div className="pl-4 border-l border-white/20">
              <TocList
                items={item.children}
                collapsedIds={collapsedIds}
                onToggle={onToggle}
              />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default ArticleContent;
