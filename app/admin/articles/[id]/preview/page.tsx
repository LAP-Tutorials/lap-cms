"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  ExternalLink,
  FileText,
  Pencil,
} from "lucide-react";
import { Breadcrumb } from "@/components/breadcrumb";
import { Button } from "@/components/ui/button";
import { useDocument } from "@/hooks/use-firestore-query";
import { formatDate, sanitizeUrl } from "@/lib/utils";

interface ArticlePreview {
  id: string;
  title?: string;
  description?: string;
  content?: string | Record<string, unknown>;
  img?: string;
  imgAlt?: string;
  label?: string;
  authorName?: string;
  slug?: string;
  publish?: boolean;
  createdAt?: any;
  date?: any;
  scheduledPublishDate?: any;
  read?: string;
}

export default function AdminArticlePreviewPage() {
  const params = useParams();
  const articleId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { data: article, isLoading } = useDocument<ArticlePreview>(
    "articles",
    articleId ?? null,
  );
  const [previewHtml, setPreviewHtml] = useState("");

  const articleContent = useMemo(() => {
    if (!article?.content) return "";
    return typeof article.content === "string"
      ? article.content
      : JSON.stringify(article.content, null, 2);
  }, [article?.content]);

  const previewImage = useMemo(() => sanitizeUrl(article?.img), [article?.img]);
  const isPublished = Boolean(article?.publish);
  const liveHref =
    article?.slug && isPublished
      ? `https://lap-docs.netlify.app/posts/${article.slug}`
      : null;

  useEffect(() => {
    const generatePreview = async () => {
      if (!articleContent) {
        setPreviewHtml("<p>No article content yet.</p>");
        return;
      }

      try {
        marked.setOptions({
          gfm: true,
          breaks: true,
        });

        const rawHtml = await marked.parse(articleContent);
        const sanitized = DOMPurify.sanitize(rawHtml, {
          ADD_TAGS: ["iframe"],
          ADD_ATTR: [
            "allow",
            "allowfullscreen",
            "frameborder",
            "height",
            "scrolling",
            "src",
            "width",
          ],
        });

        setPreviewHtml(sanitized);
      } catch (error) {
        console.error("Error generating preview:", error);
        setPreviewHtml("<p>Error generating preview.</p>");
      }
    };

    generatePreview();
  }, [articleContent]);

  const breadcrumbItems = [
    { label: "Dashboard", href: "/admin" },
    { label: "Articles", href: "/admin/articles" },
    { label: article?.title || "Preview" },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen px-4 py-8 text-white">
        <div className="flex items-center gap-3 text-white/70">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          Loading article preview...
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen px-4 py-8 text-white">
        <div className="mb-6">
          <Breadcrumb items={breadcrumbItems} />
        </div>

        <div className="max-w-3xl rounded-none border border-white/10 bg-white/5 p-8">
          <h1 className="text-2xl font-semibold">Article not found</h1>
          <p className="mt-3 text-white/70">
            This article could not be loaded for preview.
          </p>
          <Button asChild className="mt-6" variant="outline">
            <Link href="/admin/articles">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to articles
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 pb-10 text-white">
      <div className="mb-4 mt-6 md:mt-0">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <div className="mb-6 flex flex-col gap-4 border border-white/10 bg-white/5 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-none px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                isPublished
                  ? "bg-emerald-500/15 text-emerald-300"
                  : article.scheduledPublishDate
                    ? "bg-orange-500/15 text-orange-300"
                    : "bg-sky-500/15 text-sky-300"
              }`}
            >
              {isPublished
                ? "Live on public site"
                : article.scheduledPublishDate
                  ? "Scheduled preview"
                  : "Draft preview"}
            </span>
            {article.label ? (
              <span className="inline-flex items-center rounded-none border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                {article.label}
              </span>
            ) : null}
          </div>

          <div>
            <h1 className="text-3xl font-semibold sm:text-4xl">
              {article.title || "Untitled article"}
            </h1>
            {article.description ? (
              <p className="mt-3 max-w-3xl text-base text-white/70 sm:text-lg">
                {article.description}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-white/60">
            <span className="inline-flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {article.authorName || "Unknown author"}
            </span>
            {article.read ? (
              <span className="inline-flex items-center gap-2">
                <Clock3 className="h-4 w-4" />
                {article.read}
              </span>
            ) : null}
            {article.createdAt ? (
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Created {formatDate(article.createdAt.toDate?.())}
              </span>
            ) : null}
            {article.scheduledPublishDate && !isPublished ? (
              <span className="inline-flex items-center gap-2 text-orange-300">
                <CalendarDays className="h-4 w-4" />
                Scheduled for{" "}
                {formatDate(article.scheduledPublishDate.toDate?.())}
              </span>
            ) : null}
            {article.date && isPublished ? (
              <span className="inline-flex items-center gap-2 text-emerald-300">
                <CalendarDays className="h-4 w-4" />
                Published {formatDate(article.date.toDate?.() || article.date)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href={`/admin/articles/${article.id}`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit article
            </Link>
          </Button>
          {liveHref ? (
            <Button asChild>
              <Link href={liveHref} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                View live post
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {previewImage ? (
        <div className="mb-8 overflow-hidden border border-white/10 bg-white/5">
          <img
            src={previewImage}
            alt={article.imgAlt?.trim() || article.title || "Article preview"}
            className="max-h-[28rem] w-full object-cover"
            onError={(event) => {
              event.currentTarget.src = "/placeholder.svg?height=480&width=1280";
            }}
          />
        </div>
      ) : null}

      <article className="border border-white/10 bg-[#0d0d0d] p-6 sm:p-8">
        <div
          className="markdown-body mx-auto max-w-4xl"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </article>
    </div>
  );
}
