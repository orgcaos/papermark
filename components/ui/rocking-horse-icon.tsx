import styles from "./rocking-horse-icon.module.css";

// Loading motif shown in ViewerLoadingCover while the document's first-page
// thumbnail is still loading, and as the permanent fallback when no
// thumbnail exists at all (video, sheet, HTML, and Notion documents don't
// have one -- see pages/api/public/thumbnail/[documentId].ts).
//
// Slides gently side to side via the CSS module (a plain @keyframes
// translateX loop) rather than JS, so it costs nothing beyond this inline
// SVG. Respects prefers-reduced-motion.
export default function RockingHorseIcon({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      width="232"
      height="132"
      viewBox="-20 0 232 132"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <g className={styles.rockingHorse}>
        <path
          d="M0 99.5213C0 117.259 14.3599 131.789 32.098 131.789H144.609C162.348 131.789 176.707 117.259 176.707 99.5213H167.584C167.584 111.178 158.969 120.638 147.818 122.159L139.371 101.042H129.574L138.189 122.497H38.8552L47.471 101.042H37.5041L29.0569 122.328C17.9067 120.807 9.12234 111.177 9.12234 99.5205H0V99.5213Z"
          fill="#DECEBD"
        />
        <path
          d="M148.748 79.756L157.702 43.774C157.702 51.7138 164.121 58.1331 172.061 58.1331C180.001 58.1331 186.421 51.7138 186.421 43.774C186.421 28.0622 173.581 15.2236 157.702 15.2236C136.584 15.2236 118.17 25.3591 106.344 40.9015L148.747 79.7568L148.748 79.756Z"
          fill="#FBFBF9"
        />
        <path
          d="M152.971 101.042C152.971 65.3549 124.041 36.4248 88.3533 36.4248C52.6659 36.4248 23.7358 65.3549 23.7358 101.042H152.971Z"
          fill="#FBFBF9"
        />
        <path
          d="M157.791 20.4404C169.958 20.4404 182.1 15.8213 191.347 6.58236L184.88 0.115812C169.925 15.0792 145.517 15.0295 130.496 0L124.029 6.46734C133.35 15.7717 145.575 20.4412 157.791 20.4412L157.791 20.4404Z"
          fill="#DECEBD"
        />
        <path
          d="M157.688 32.9812C160.088 32.9812 162.032 31.0363 162.032 28.6371C162.032 26.2379 160.088 24.293 157.688 24.293C155.289 24.293 153.344 26.2379 153.344 28.6371C153.344 31.0363 155.289 32.9812 157.688 32.9812Z"
          fill="#131720"
        />
        <mask
          id="rocking-horse-blanket-mask"
          style={{ maskType: "luminance" }}
          maskUnits="userSpaceOnUse"
          x="23"
          y="36"
          width="130"
          height="66"
        >
          <path
            d="M152.971 101.043C152.971 65.3559 124.041 36.4258 88.3533 36.4258C52.6659 36.4258 23.7358 65.3559 23.7358 101.043H152.971Z"
            fill="white"
          />
        </mask>
        <g mask="url(#rocking-horse-blanket-mask)">
          <path
            d="M77.7537 18.2048C81.1674 17.6667 84.7607 17.3066 88.5329 17.3066C95.1814 17.3066 101.468 18.564 107.576 20.3603V67.3239V71.9422V79.6197H104.322V71.9422H100.538V79.6197H97.2834V71.9422H93.5002V79.6197H90.2456V71.9422H86.4617V79.6197H83.2071V71.9422H79.4231V79.6197H76.1686V71.9422H72.3854V79.6197H69.1309V71.9422V67.3239V20.1807C72.0049 19.2825 74.8797 18.7444 77.7537 18.2048Z"
            fill="#BC5E4E"
          />
        </g>
      </g>
    </svg>
  );
}
