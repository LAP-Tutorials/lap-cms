"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Image from "next/image";
import { marked } from "marked";
import DOMPurify from "dompurify";

import ArticleContent from "@/components/ArticleContent";
import PostNavigation from "@/components/PostNavigation";

import { useDocument } from "@/hooks/use-firestore-query";
import { formatDate, sanitizeUrl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import ScrollToTop from "@/components/ScrollToTop";

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
  topicPath?: string;
  video?: {
    url: string;
    embedUrl: string;
    thumbnailUrl?: string;
  };
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

  const isPublished = Boolean(article?.publish);

  useEffect(() => {
    const generatePreview = async () => {
      if (!articleContent) {
        setPreviewHtml(
          "<p className='text-white/40 italic text-xl'>No article content yet...</p>",
        );
        return;
      }

      try {
        const renderer = new marked.Renderer();

        // Generate IDs for headings to support TOC
        renderer.heading = ({
          text,
          depth,
        }: {
          text: string;
          depth: number;
        }) => {
          const escapedText = text.toLowerCase().replace(/[^\w]+/g, "-");
          return `<h${depth} id="${escapedText}">${text}</h${depth}>`;
        };

        marked.setOptions({
          gfm: true,
          breaks: true,
          renderer,
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
            "id",
            "title",
            "referrerpolicy",
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#121212] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[#8a2ae3]" />
          <p className="text-xs uppercase tracking-[0.3em] text-white/40 font-bold">
            Preparing Production Preview
          </p>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-[#121212] px-6 py-20 text-white flex items-center justify-center">
        <div className="max-w-xl text-center">
          <h1 className="text-4xl font-bold mb-4 tracking-tighter uppercase">
            ARTICLE NOT FOUND
          </h1>
          <p className="text-white/50 mb-8 text-lg">
            The article you're looking for doesn't exist or has been removed.
          </p>
          <Button
            asChild
            variant="outline"
            className="rounded-full border-white/20 px-8 hover:bg-white hover:text-black transition-all"
          >
            <Link href="/admin/articles">Back to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-[95rem] w-full mx-auto px-4 md:pt-8 sm:pt-4 xs:pt-2 lg:pb-4 md:pb-4 sm:pb-2 xs:pb-2 text-white bg-[#121212]">
      {/* CMS UI Elements (Sticky) */}
      <div className="sticky top-0 z-50 bg-[#121212]/90 backdrop-blur-md border-b border-white/5 px-4 py-2 -mx-4 mb-4">
        <div className="max-w-[95rem] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${isPublished ? "bg-emerald-500" : "bg-orange-500"}`}
              />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
                {isPublished ? "Live" : "Draft Preview"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="text-white/60 hover:text-white hover:bg-white/5 rounded-full px-4"
            >
              <Link href={`/admin/articles/${article.id}`}>Edit Article</Link>
            </Button>
          </div>
        </div>
      </div>

      <PostNavigation href="/admin/articles">POSTS</PostNavigation>

      <article className="grid md:grid-cols-2 gap-6 md:gap-10 pb-6 md:pb-24 items-start">
        <div>
          <h1 className="text-subtitle">{article.title}</h1>
        </div>

        <div className="flex flex-col gap-6 md:gap-8">
          <Link
            href={article.topicPath || "#"}
            className="px-3 py-2 border border-white rounded-full w-fit h-fit hover:bg-white hover:text-black transition ml-auto"
          >
            <span className="uppercase">{article.label}</span>
          </Link>
          <p className="text-lg md:text-xl font-light text-white/90 leading-relaxed">
            {article.description}
          </p>
          <div className="flex flex-col sm:flex-row md:items-center gap-2 sm:gap-6 text-base font-medium">
            <span className="flex flex-wrap">
              <p className="font-semibold pr-2">Author:</p>
              <p className="text-[#8a2ae3]">{article.authorName}</p>
            </span>
            <span className="flex flex-wrap">
              <p className="font-semibold pr-2">Published:</p>
              <time>
                {isPublished && article.date
                  ? new Date(
                      article.date.toDate?.() || article.date,
                    ).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : article.createdAt
                    ? new Date(article.createdAt.toDate?.()).toLocaleDateString(
                        "en-US",
                        {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        },
                      )
                    : "---"}
              </time>
            </span>

            <span className="flex flex-wrap items-center">
              <p className="font-semibold pr-2">Read:</p>
              <p>{article.read}</p>
            </span>
            {article.video ? (
              <a
                href={article.video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 border border-white rounded-full w-fit h-fit hover:bg-white hover:text-black transition"
              >
                Watch Source Video
              </a>
            ) : null}
          </div>
        </div>
      </article>

      <div className="relative w-full h-auto aspect-[16/9] mb-12">
        {article.img && (
          <Image
            src={article.img}
            alt={article.imgAlt || article.title || ""}
            fill
            sizes="(min-width: 1520px) 1520px, 100vw"
            className="object-cover w-full h-auto"
          />
        )}
      </div>

      <div className="w-full">
        <ArticleContent htmlContent={previewHtml} />
      </div>

      <ScrollToTop />
    </main>
  );
}
