import Image from "next/image";
import Link from "next/link";
import {
  RiInstagramLine,
  RiTwitterFill,
  RiYoutubeFill,
  RiGithubFill,
  RiTiktokFill,
  RiPatreonFill,
  RiFacebookFill,
  RiLinkedinFill,
  RiDiscordFill,
  RiLink,
} from "react-icons/ri";

// Define the social icons mapping
const SOCIAL_ICONS: Record<string, any> = {
  youtube: RiYoutubeFill,
  github: RiGithubFill,
  instagram: RiInstagramLine,
  twitter: RiTwitterFill,
  tiktok: RiTiktokFill,
  patreon: RiPatreonFill,
  facebook: RiFacebookFill,
  linkedin: RiLinkedinFill,
  discord: RiDiscordFill,
  link: RiLink,
};

interface AuthorCardProps {
  authorData: {
    name: string;
    avatar?: string;
    imgAlt?: string;
    biography?: {
      summary?: string;
    };
    socials?: Record<string, string>;
    slug?: string;
  };
}

// AuthorCard component
function AuthorCard({ authorData }: AuthorCardProps) {
  // Generate social media links dynamically
  const socialLinks = authorData.socials
    ? Object.entries(authorData.socials)
        .filter(([_, url]) => url) // Remove empty links
        .map(([platform, url]) => ({
          href: url,
          ariaLabel: `Visit ${authorData.name}'s ${platform} page`,
          Icon: SOCIAL_ICONS[platform.toLowerCase()] || RiGithubFill, // Default to GitHub icon if unknown
        }))
    : [];

  return (
    <div className="author-card text-white border border-white p-6 md:p-8 md:w-[70%] mx-auto">
      <div className="flex flex-col items-center md:flex-row md:items-start">
        <div className="avatar-container mb-4 md:mb-0 md:mr-20">
          <Image
            className="w-full max-w-[240px] h-auto rounded-full"
            src={authorData.avatar || "/placeholder.svg"}
            alt={authorData.imgAlt || authorData.name}
            width={150}
            height={150}
          />
        </div>
        <div className="content-container text-center md:text-left">
          <h2 className="heading3-title">{authorData.name}</h2>
          <p className="mt-2 text-white">{authorData.biography?.summary}</p>
          {socialLinks.length > 0 && (
            <div className="mt-4 flex justify-center md:justify-start space-x-4">
              {socialLinks.map((link, index) => (
                <Link
                  key={index}
                  href={link.href as string}
                  target="_blank"
                  aria-label={link.ariaLabel}
                  className="text-white text-2xl hover:text-purple-500 transition ease-in-out duration-300"
                >
                  <link.Icon size={24} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AuthorCard;
