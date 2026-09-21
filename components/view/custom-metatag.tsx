import Head from "next/head";

const CustomMetaTag = ({
  enableBranding,
  title,
  description,
  imageUrl,
  url,
  favicon,
}: {
  enableBranding: boolean;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  favicon: string | null;
  url: string | null;
}) => {
  return (
    <Head>
      {/* meta URL */}
      {url && (
        <>
          <link rel="canonical" href={url} key="canonical" />
          <meta property="og:url" content={url} key="og-url" />
        </>
      )}

      {favicon && (
        <>
          <link rel="icon" type="image/x-icon" href={favicon} key="favicon" />
          {favicon.endsWith(".ico") && (
            <link rel="icon" type="image/x-icon" href={favicon} />
          )}
          {favicon.endsWith(".png") && (
            <link rel="icon" type="image/png" href={favicon} sizes="32x32" />
          )}
          {favicon.endsWith(".svg") && (
            <link rel="icon" type="image/svg+xml" href={favicon} />
          )}
          <link rel="apple-touch-icon" href={favicon} />
        </>
      )}

      {/* meta title -- shown regardless of the "custom branding" toggle.
          The title here is already computed with a sensible fallback (the
          document/dataroom name, e.g. "Q3 Proposal.pdf | Orgcaos Docket")
          by the calling page, so a shared link's social preview shows what
          was actually shared instead of falling through to the generic
          site-wide title in pages/_app.tsx / app/layout.tsx. Only the
          description and image stay behind enableBranding below, since
          those need genuinely custom content (an uploaded image, custom
          copy) rather than a name that's already known. See
          build-status.md, 2026-09-21 ("social share preview shows generic
          text"), for the report this fixes. */}
      {title && (
        <>
          <title>{title}</title>
          <meta property="og:title" content={title} key="og-title" />
          <meta name="twitter:title" content={title} key="tw-title" />
        </>
      )}

      {/* meta description */}
      {enableBranding && description && (
        <>
          <meta name="description" content={description} key="description" />
          <meta
            property="og:description"
            content={description}
            key="og-description"
          />
          <meta
            name="twitter:description"
            content={description}
            key="tw-description"
          />
        </>
      )}

      {/* meta image */}
      {enableBranding && imageUrl && (
        <>
          <meta property="og:image" content={imageUrl} key="og-image" />
          <meta name="twitter:image" content={imageUrl} key="tw-image" />
        </>
      )}
    </Head>
  );
};

export default CustomMetaTag;
