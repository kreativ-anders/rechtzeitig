# Build the docs locally

This folder is the source of the documentation site, published with GitHub Pages. To preview it on your machine:

1. Install Ruby 3 or newer. On macOS the system Ruby is too old; use `brew install ruby` and put `/opt/homebrew/opt/ruby/bin` first in your `PATH`.
2. Install Jekyll, the theme and the plugins GitHub Pages turns on by default:

   ```sh
   gem install jekyll minima jekyll-seo-tag jekyll-relative-links \
     jekyll-optional-front-matter jekyll-default-layout \
     jekyll-titles-from-headings webrick csv base64 bigdecimal logger
   ```

   `webrick`, `csv`, `base64`, `bigdecimal` and `logger` are no longer part of newer Ruby versions, but Jekyll needs them.

3. From the repository root, start the server:

   ```sh
   jekyll serve --livereload --disable-disk-cache -s docs -d /tmp/rechtzeitig-site
   ```

4. Open http://127.0.0.1:4000/. The page reloads when a file in `docs/` changes.

`docs/checks.md` is generated. After changing a `rule.yml`, run `npm run docs` and the site picks up the new version.

The build output goes to `/tmp` and `--disable-disk-cache` stops Jekyll from writing `.jekyll-cache` into `docs/`, so the repository stays clean.

The local build uses current Jekyll, while GitHub Pages uses its own pinned versions. Small differences in rendering are possible.
