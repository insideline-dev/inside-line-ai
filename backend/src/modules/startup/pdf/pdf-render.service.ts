import {
  Injectable,
  Logger,
  OnModuleDestroy,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import puppeteer, { Browser, Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { JWT_COOKIE_NAME } from "../../../auth/auth.constants";
import { PrintTokenService } from "./print-token.service";

type PrintKind = "memo" | "report";

@Injectable()
export class PdfRenderService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRenderService.name);
  private browserPromise: Promise<Browser> | null = null;
  private readonly navigationTimeoutMs = 45_000;
  private readonly readyTimeoutMs = 30_000;

  constructor(
    private config: ConfigService,
    private printTokens: PrintTokenService,
  ) {}

  async renderMemo(startupId: string, userId: string): Promise<Buffer> {
    return this.render("memo", startupId, userId);
  }

  async renderReport(startupId: string, userId: string): Promise<Buffer> {
    return this.render("report", startupId, userId);
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.browserPromise) return;
    try {
      const browser = await this.browserPromise;
      await browser.close();
    } catch (err) {
      this.logger.warn(`Failed to close browser cleanly: ${(err as Error).message}`);
    }
    this.browserPromise = null;
  }

  private async render(
    kind: PrintKind,
    startupId: string,
    userId: string,
  ): Promise<Buffer> {
    const { token } = this.printTokens.mint(userId, startupId, kind);
    const frontendUrl = this.config.get<string>("FRONTEND_URL") ?? "http://localhost:3030";
    const url = new URL(`/print/${kind}/${startupId}`, frontendUrl).toString();

    const browser = await this.getBrowser();
    const page = await browser.newPage();
    page.on("console", (msg) => {
      this.logger.debug(`[print:${kind}] console.${msg.type()}: ${msg.text()}`);
    });
    page.on("pageerror", (err) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[print:${kind}] pageerror: ${message}`);
    });
    page.on("requestfailed", (request) => {
      const failure = request.failure();
      this.logger.warn(
        `[print:${kind}] requestfailed ${request.method()} ${request.url()}: ${failure?.errorText ?? "unknown"}`,
      );
    });
    try {
      await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
      await page.emulateMediaType("print");

      const frontendOrigin = new URL(frontendUrl);
      await page.setCookie({
        name: JWT_COOKIE_NAME,
        value: token,
        domain: frontendOrigin.hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        secure: frontendOrigin.protocol === "https:",
      });

      this.logger.log(`Rendering ${kind} PDF for startup ${startupId} at ${url}`);
      await page.goto(url, { waitUntil: "networkidle0", timeout: this.navigationTimeoutMs });
      await page.waitForFunction("window.__PRINT_READY__ === true", {
        timeout: this.readyTimeoutMs,
      });

      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: this.headerTemplate(),
        footerTemplate: this.footerTemplate(),
        margin: { top: "28mm", bottom: "22mm", left: "14mm", right: "14mm" },
        preferCSSPageSize: false,
      });

      return Buffer.from(pdf);
    } catch (err) {
      const currentUrl = page.url();
      this.logger.error(
        `Puppeteer render failed for ${kind} ${startupId} at ${currentUrl}: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException(
        `Failed to render ${kind} PDF: ${(err as Error).message}`,
      );
    } finally {
      await this.safeClosePage(page);
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browserPromise) {
      const browser = await this.browserPromise;
      if (browser.connected) return browser;
      this.browserPromise = null;
    }

    this.browserPromise = (async () => {
      const { executablePath, useChromiumArgs } = await this.resolveExecutablePath();
      const linuxArgs =
        process.platform === "linux"
          ? [
              "--no-sandbox",
              "--disable-setuid-sandbox",
              "--disable-dev-shm-usage",
              "--disable-gpu",
            ]
          : [];

      return puppeteer.launch({
        args: useChromiumArgs
          ? [...chromium.args, ...linuxArgs]
          : linuxArgs,
        executablePath,
        headless: true,
        defaultViewport: { width: 1200, height: 1600 },
        protocolTimeout: 120000,
      });
    })();

    const browser = await this.browserPromise;
    browser.on("disconnected", () => {
      this.browserPromise = null;
    });
    return browser;
  }

  private async resolveExecutablePath(): Promise<{
    executablePath: string;
    useChromiumArgs: boolean;
  }> {
    const configuredPath = this.config.get<string>("PUPPETEER_EXECUTABLE_PATH");
    if (configuredPath) {
      return { executablePath: configuredPath, useChromiumArgs: false };
    }

    const { access } = await import("node:fs/promises");
    const candidates =
      process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Arc.app/Contents/MacOS/Arc",
          ]
        : process.platform === "linux"
          ? [
              "/usr/bin/google-chrome",
              "/usr/bin/google-chrome-stable",
              "/usr/bin/chromium",
              "/usr/bin/chromium-browser",
              "/snap/bin/chromium",
            ]
          : [];

    for (const candidate of candidates) {
      try {
        await access(candidate);
        return { executablePath: candidate, useChromiumArgs: false };
      } catch {
        continue;
      }
    }

    // `@sparticuz/chromium` ships a Linux x86-64 ELF binary for Lambda-style
    // deploys. Prefer a system browser in containers; fall back to Sparticuz
    // only when no stable local executable is present.
    if (process.platform === "linux") {
      try {
        const bundledPath = await chromium.executablePath();
        if (bundledPath) {
          return { executablePath: bundledPath, useChromiumArgs: true };
        }
      } catch {
        // Fall through to final error.
      }
    }

    throw new Error(
      "No Chrome/Chromium found. Install Google Chrome or Chromium, or set PUPPETEER_EXECUTABLE_PATH / CHROME_PATH.",
    );
  }

  private async safeClosePage(page: Page | null): Promise<void> {
    if (!page) return;
    try {
      await page.close();
    } catch (err) {
      this.logger.warn(`Failed to close page: ${(err as Error).message}`);
    }
  }

  private isDev(): boolean {
    return (this.config.get<string>("NODE_ENV") ?? "development") === "development";
  }

  private headerTemplate(): string {
    return `<div style="font-family: 'DM Sans', Helvetica, Arial, sans-serif; font-size: 8px; color: #6b7280; width: 100%; padding: 10mm 14mm 0; display: flex; justify-content: space-between; align-items: flex-start; box-sizing: border-box;">
      <span style="letter-spacing: 0.08em; text-transform: uppercase;">Inside Line</span>
      <span class="date"></span>
    </div>`;
  }

  private footerTemplate(): string {
    return `<div style="font-family: 'DM Sans', Helvetica, Arial, sans-serif; font-size: 8px; color: #6b7280; width: 100%; padding: 0 14mm 8mm; display: flex; justify-content: space-between; align-items: flex-end; box-sizing: border-box;">
      <span>Confidential</span>
      <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
    </div>`;
  }
}
