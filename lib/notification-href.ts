const DOCS_ORIGIN = "https://lap.onl";

type NotificationLinkSource = {
  type?: string;
  link?: string;
  metadata?: {
    articleId?: string;
    articleSlug?: string;
  };
};

function publicPostHref(item: NotificationLinkSource) {
  const slug =
    item.metadata?.articleSlug?.trim() ||
    item.link?.match(/^\/posts\/([^#?/]+)/)?.[1] ||
    "";
  return slug ? `${DOCS_ORIGIN}/posts/${slug}` : "";
}

export function getCmsNotificationHref(item: NotificationLinkSource) {
  if (item.type === "user_report") return "/admin/reports";
  if (item.type === "new_post") {
    return (
      publicPostHref(item) ||
      (item.metadata?.articleId
        ? `/admin/articles/${item.metadata.articleId}`
        : "/admin/articles")
    );
  }
  if (item.link?.startsWith("/admin/")) return item.link;
  if (item.type === "mention" || item.type === "new_comment") {
    return "/admin/comments";
  }
  if (item.link?.startsWith("http")) return item.link;
  if (item.link?.startsWith("/")) return item.link;
  return "/admin/comments";
}

export function openCmsNotification(
  item: NotificationLinkSource,
  navigate: (href: string) => void,
) {
  const href = getCmsNotificationHref(item);
  if (href.startsWith("http")) {
    window.open(href, "_blank", "noopener,noreferrer");
    return;
  }
  navigate(href);
}
