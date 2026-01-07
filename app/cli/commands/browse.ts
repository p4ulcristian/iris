/**
 * Open URL in Iris browser.
 */

import { send } from "../lib/ws"

export async function browse(args: string[]): Promise<number> {
  let url = args[0]

  if (!url) {
    console.error("Usage: iris browse <url>")
    console.error("")
    console.error("Examples:")
    console.error("  iris browse github.com")
    console.error("  iris browse https://example.com")
    console.error("  iris browse /path/to/file.html")
    return 1
  }

  // Handle local file paths
  if (url.startsWith("/")) {
    url = "file://" + url
  } else if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("file://")) {
    url = "https://" + url
  }

  const success = await send({
    event: "entity:spawn",
    type: "browser",
    url,
  })

  if (!success) {
    console.error(`\x1b[31mFailed to open ${url}\x1b[0m`)
    return 1
  }

  console.log(`\x1b[32mOpening ${url} in browser\x1b[0m`)
  return 0
}
