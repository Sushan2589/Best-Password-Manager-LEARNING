# Bundled fonts

Unmodified upstream variable WOFF2 files, downloaded once and committed. No font
download script runs during install/build/runtime. Keep the corresponding licenses.

| File | Upstream revision | SHA-256 |
| --- | --- | --- |
| `InterVariable.woff2` | `rsms/inter` `353b61b9f4430d5f420d56605a6e7993e0941470` | `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3` |
| `PlusJakartaSansVariable.woff2` | `tokotype/PlusJakartaSans` `18d1cd2f7ea10481919d2f05c1f7064b7307fc26` | `49c62cf1fb70f225ea113361f0134a48858c3a7d0175173aa3e38a0c6c8539d2` |

Sources:

- [Inter WOFF2](https://raw.githubusercontent.com/rsms/inter/353b61b9f4430d5f420d56605a6e7993e0941470/docs/font-files/InterVariable.woff2)
- [Inter license](https://raw.githubusercontent.com/rsms/inter/353b61b9f4430d5f420d56605a6e7993e0941470/LICENSE.txt), saved as `Inter-OFL.txt`.
- [Plus Jakarta Sans WOFF2](https://raw.githubusercontent.com/tokotype/PlusJakartaSans/18d1cd2f7ea10481919d2f05c1f7064b7307fc26/fonts/webfonts/PlusJakartaSans%5Bwght%5D.woff2)
- [Plus Jakarta Sans license](https://raw.githubusercontent.com/tokotype/PlusJakartaSans/18d1cd2f7ea10481919d2f05c1f7064b7307fc26/OFL.txt), saved as `PlusJakartaSans-OFL.txt`.

Update deliberately: verify upstream source/license, replace the assets, update
these revision/hash records, then build and check typography and browser security
tests. Do not add remote CSS imports or relax `font-src 'self'`.
