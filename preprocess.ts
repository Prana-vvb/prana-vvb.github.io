import { Glob } from "bun";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const SOURCE_DIR = "content";
const BUILD_DIR = ".content_build";

async function build() {
    console.log(`Pre-processing markdown from ./${SOURCE_DIR} to ./${BUILD_DIR}...`);

    const glob = new Glob("**/*");

    for await (const file of glob.scan(SOURCE_DIR)) {
        const srcPath = join(SOURCE_DIR, file);
        const destPath = join(BUILD_DIR, file);

        // Ensure the destination directory tree exists
        await mkdir(dirname(destPath), { recursive: true });

        const srcFile = Bun.file(srcPath);

        if (file.endsWith(".md")) {
            let text = await srcFile.text();

            // Regex intercepts: ```language caption="text"
            // \n ensures we don't capture the initial newline as part of the code block
            const regex = /```(\w+)\s+caption="([^"]+)"\n([\s\S]*?)```/g;

            text = text.replace(regex, (match, lang, caption, code) => {

                const safeCode = code
                    // 1. Strip only trailing whitespace.
                    .replace(/\s+$/, "")
                    // 2. Escape HTML entities to prevent the DOM from swallowing generics like <T>
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    // 3. Replace literal newlines with HTML line-feed entities
                    // This condenses the entire block onto a single line to outsmart the Markdown parser
                    .replace(/\r?\n/g, "&#10;");

                // Return the contiguous string without any literal \n characters
                return `<div class="code-wrapper"><pre><code class="language-${lang}">${safeCode}</code></pre><div class="code-caption">${caption}</div></div>`;
            });

            // Regex intercepts H2 and H3 markdown headings
            const headingRegex = /^(#{2,3})\s+(.+?)$/gm;

            text = text.replace(headingRegex, (match, hashes, titleText) => {
                // Skip if the heading already has an anchor link or explicit {#id} attribute
                if (titleText.includes('class="heading-anchor"') || titleText.includes('[#')) {
                    return match;
                }

                // Strip markdown links, inline code backticks, and formatting prior to slug generation
                const cleanText = titleText
                    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Extract text from [text](url)
                    .replace(/`([^`]+)`/g, '$1')            // Strip code backticks
                    .replace(/[*_~]/g, '');                 // Strip bold/italics

                // Generate slug matching standard URL rules
                const slug = cleanText
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric characters with hyphens
                    .replace(/(^-|-$)/g, '');    // Remove leading and trailing hyphens

                // Attach class="heading-anchor" to isolate styling from content links
                return `${hashes} ${titleText} <a id="${slug}" href="#${slug}" class="heading-anchor">#</a>`;
            });

            await Bun.write(destPath, text);
        } else {
            // Copy images or other non-markdown assets as-is
            await Bun.write(destPath, srcFile);
        }
    }

    console.log("Pre-processing complete!");
}

build().catch((err) => {
    console.error("Failed during pre-processing:", err);
    process.exit(1);
});
