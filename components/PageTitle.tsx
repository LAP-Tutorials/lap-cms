type PageTitleProps = {
  children: React.ReactNode;
  className?: string;
  imgSrc: string;
  imgAlt: string;
};

export default function PageTitle({
  children,
  className,
  imgSrc,
  imgAlt,
}: PageTitleProps) {
  return (
    <div className="max-w-[95rem] w-full mx-auto overflow-hidden">
      <h1 className={className}>{children}</h1>
      {imgSrc && (
        <img
          src={imgSrc}
          alt={imgAlt}
          className="py-3 md:py-6 h-auto max-h-14 md:max-h-20 w-auto max-w-full object-contain"
        />
      )}
    </div>
  );
}
