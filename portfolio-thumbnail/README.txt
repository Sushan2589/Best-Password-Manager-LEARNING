Portfolio thumbnails — Password Manager

Recommended: password-manager-thumbnail.webp (or .png)
Uses the actual vault and extension screenshots with the project's real colors, logo, and typography.

Alternative: password-manager-website.webp (or .png)
A framed screenshot of the actual local homepage.

Both are 1600 x 832 pixels, matching the approximately 1.92:1 image area in CARDss.png.
Use width:100%; aspect-ratio:25/13; object-fit:cover in the portfolio card.
The -card-preview.png files show each option at 414 x 216 pixels.
Sample accounts in the product images are fictional.

create-thumbnail.mjs rebuilds both using Playwright with the web app running at http://127.0.0.1:3046.
No application source was changed.
