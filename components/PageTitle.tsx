type PageTitleProps = {
  children: React.ReactNode;
  className?: string;
  imgSrc: string;
  imgAlt: string;
};

// These exports contain live <text> nodes. Fonts inside an SVG loaded through
// <img> are isolated from the page, so Safari/iPadOS substitutes Roboto. Render
// the same title as inline SVG text so it can use Next's bundled Roboto file.
const FONT_DEPENDENT_TITLES = new Set([
  "/images/titles/activity.svg",
  "/images/titles/Analytics.svg",
  "/images/titles/assets.svg",
  "/images/titles/comments.svg",
  "/images/titles/edit-member.svg",
  "/images/titles/handles.svg",
  "/images/titles/new-member.svg",
  "/images/titles/notifications.svg",
  "/images/titles/prmote-a-moderator.svg",
  "/images/titles/reports.svg",
  "/images/titles/users.svg",
]);

export default function PageTitle({
  children,
  className,
  imgSrc,
  imgAlt,
}: PageTitleProps) {
  const titleText =
    typeof children === "string" || typeof children === "number"
      ? String(children).toUpperCase()
      : imgAlt.toUpperCase();
  const needsBundledFont = FONT_DEPENDENT_TITLES.has(imgSrc);

  return (
    <div className="max-w-[95rem] w-full mx-auto">
      <h1 className={className}>{children}</h1>
      {needsBundledFont ? (
        <svg
          viewBox="0 0 1520 231"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          focusable="false"
          className="h-auto w-full py-6 md:py-12"
        >
          <text
            x="760"
            y="211"
            textAnchor="middle"
            textLength="1480"
            lengthAdjust="spacingAndGlyphs"
            fill="#8a2be2"
            fontSize="230"
            fontWeight="700"
            style={{ fontFamily: "var(--font-title), sans-serif" }}
          >
            {titleText}
          </text>
        </svg>
      ) : imgSrc ? (
        <img
          src={imgSrc}
          alt={imgAlt}
          className="h-auto w-full py-6 md:py-12"
        />
      ) : null}
    </div>
  );
}
